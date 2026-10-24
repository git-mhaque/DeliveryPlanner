"""Safe YAML loading, JSON Schema checks, and delivery-domain diagnostics."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

SKILL_ROOT = Path(__file__).resolve().parents[2]


class PlanLoader(yaml.SafeLoader):
    # ISO dates stay strings, whether quoted or not, for consistent schema checks.
    yaml_implicit_resolvers = {
        key: [(tag, pattern) for tag, pattern in values if tag != "tag:yaml.org,2002:timestamp"]
        for key, values in yaml.SafeLoader.yaml_implicit_resolvers.items()
    }

    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            event = self.peek_event()
            raise yaml.YAMLError(f"YAML aliases are unsupported (line {event.start_mark.line + 1}); use explicit records.")
        return super().compose_node(parent, index)

    def construct_mapping(self, node, deep=False):
        result = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, str):
                raise yaml.YAMLError(f"Mapping keys must be strings (line {key_node.start_mark.line + 1}).")
            if key in result:
                raise yaml.YAMLError(f"Duplicate YAML key {key!r} (line {key_node.start_mark.line + 1}).")
            result[key] = self.construct_object(value_node, deep=deep)
        return result


@dataclass
class Diagnostic:
    severity: str
    code: str
    path: str
    message: str
    line: int | None = None
    object_id: str | None = None

    def to_dict(self):
        return asdict(self)


@dataclass
class ValidationResult:
    data: dict | None
    source: bytes
    diagnostics: list[Diagnostic]

    @property
    def valid(self):
        return not any(item.severity == "error" for item in self.diagnostics)


def path_string(parts):
    value = "$"
    for part in parts:
        value += f"[{part}]" if isinstance(part, int) else f".{part}"
    return value


def read_plan(path: Path, *, for_publish=False) -> ValidationResult:
    source = path.read_bytes()
    marks = {}
    try:
        loader = PlanLoader(source.decode("utf-8"))
        try:
            node = loader.get_single_node()

            def record(node, parts=()):
                if node is None:
                    return
                marks[parts] = node.start_mark.line + 1
                if isinstance(node, yaml.MappingNode):
                    for key, value in node.value:
                        record(value, parts + (key.value,))
                elif isinstance(node, yaml.SequenceNode):
                    for index, value in enumerate(node.value):
                        record(value, parts + (index,))

            record(node)
            data = loader.construct_document(node) if node is not None else None
        finally:
            loader.dispose()
    except (yaml.YAMLError, UnicodeError, RecursionError) as exc:
        mark = getattr(exc, "problem_mark", None)
        return ValidationResult(None, source, [Diagnostic("error", "yaml", "$", str(exc), mark.line + 1 if mark else None)])
    return validate_data(data, source=source, marks=marks, for_publish=for_publish)


def validate_data(data, *, source=b"", marks=None, for_publish=False):
    marks = marks or {}
    diagnostics = []

    def emit(severity, code, parts, message, object_id=None):
        parts = tuple(parts)
        line = marks.get(parts)
        parent = parts
        while line is None and parent:
            parent = parent[:-1]
            line = marks.get(parent)
        if object_id is None:
            value = data
            try:
                for part in parts:
                    value = value[part]
                    if isinstance(value, dict) and "id" in value:
                        object_id = value["id"]
            except (KeyError, IndexError, TypeError):
                pass
        diagnostics.append(Diagnostic(severity, code, path_string(parts), message, line, object_id))

    schema = json.loads((SKILL_ROOT / "references/plan.schema.json").read_text())
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    for error in validator.iter_errors(data):
        emit("error", "schema", list(error.absolute_path), error.message)
    if diagnostics:
        return ValidationResult(data, source, diagnostics)

    collections = [(name, data[name]) for name in ("periods", "streams", "teams", "milestones")]
    collections += [(f"reporting.{name}", data["reporting"].get(name, [])) for name in ("risks", "decisions_needed")]
    indexes = {}
    for name, items in collections:
        index = {}
        for i, item in enumerate(items):
            if item["id"] in index:
                emit("error", "duplicate-id", name.split(".") + [i, "id"], f"Duplicate ID: {item['id']}.")
            index[item["id"]] = item
        indexes[name] = index

    periods, teams, milestones = (indexes[name] for name in ("periods", "teams", "milestones"))
    previous_end = None
    for i, period in enumerate(data["periods"]):
        start, end = date.fromisoformat(period["start"]), date.fromisoformat(period["end"])
        if start > end:
            emit("error", "period-range", ["periods", i], "Start must be on or before end.")
        if previous_end is not None:
            if start <= previous_end:
                emit("error", "period-overlap", ["periods", i], "Periods must be chronological and non-overlapping.")
            elif (start - previous_end).days > 1:
                emit("warning", "period-gap", ["periods", i], "There is an uncovered gap before this period.")
        previous_end = end

    as_of = date.fromisoformat(data["plan"]["as_of"]) if data["plan"]["as_of"] else None
    if as_of is None:
        emit("error" if for_publish else "warning", "reporting-date", ["plan", "as_of"], "Set a reporting date before publishing.")
    elif data["periods"] and not (data["periods"][0]["start"] <= as_of.isoformat() <= data["periods"][-1]["end"]):
        emit("warning", "outside-horizon", ["plan", "as_of"], "The reporting date is outside the plan horizon.")

    for name in ("periods", "streams", "milestones"):
        if not data[name]:
            emit("error" if for_publish else "warning", "empty-plan", [name], f"Add at least one {name.rstrip('s')} before publishing.")

    def reference(value, index, parts, kind):
        if value not in index:
            emit("error", "unknown-reference", parts, f"Unknown {kind}: {value}.")

    for i, milestone in enumerate(data["milestones"]):
        prefix = ["milestones", i]
        reference(milestone["stream"], indexes["streams"], prefix + ["stream"], "stream")
        reference(milestone["target_period"], periods, prefix + ["target_period"], "period")
        if "owner_team" in milestone:
            reference(milestone["owner_team"], teams, prefix + ["owner_team"], "team")
        else:
            emit("warning", "missing-owner", prefix, "Assign an accountable owner team.")
        for j, team in enumerate(milestone.get("contributing_teams", [])):
            reference(team, teams, prefix + ["contributing_teams", j], "team")
        if not milestone.get("outcome"):
            emit("warning", "missing-outcome", prefix, "Describe the delivery outcome.")
        if milestone["status"] in ("at_risk", "blocked") and not milestone.get("notes"):
            emit("warning", "missing-explanation", prefix, "Explain the delivery risk or blocker in notes.")
        period = periods.get(milestone["target_period"])
        if period:
            target = milestone.get("target_date", period["end"])
            if not period["start"] <= target <= period["end"]:
                emit("error", "target-date", prefix + ["target_date"], "Target date must fall within the target period.")
            if as_of and milestone["status"] != "done" and target < as_of.isoformat():
                emit("warning", "overdue", prefix, f"Target {target} is before the reporting date.")
    if data["milestones"] and not any(m.get("executive_visible") for m in data["milestones"]):
        emit("warning", "executive-coverage", ["milestones"], "Select milestones for the Executive View.")

    seen = {}
    graph = {key: [] for key in milestones}
    positions = {period["id"]: i for i, period in enumerate(data["periods"])}
    for i, edge in enumerate(data["dependencies"]):
        prefix = ["dependencies", i]
        a, b, kind = edge["from"], edge["to"], edge["kind"]
        reference(a, milestones, prefix + ["from"], "milestone")
        reference(b, milestones, prefix + ["to"], "milestone")
        if a == b:
            emit("error", "self-link", prefix, "A milestone cannot depend on or relate to itself.")
        reverse = seen.get((b, a))
        if (a, b) in seen or (reverse and (kind == "relates_to" or reverse == "relates_to")):
            emit("error", "duplicate-edge", prefix, "This pair already has a relationship in this direction.")
        seen[(a, b)] = kind
        if kind != "requires" or a not in milestones or b not in milestones:
            continue
        graph[a].append(b)
        before, after = milestones[a], milestones[b]
        if after["status"] == "done" and before["status"] != "done":
            emit("warning", "unfinished-prerequisite", prefix, f"{b} is done but prerequisite {a} is unfinished.")
        if before["target_period"] in positions and after["target_period"] in positions:
            conflict = positions[before["target_period"]] > positions[after["target_period"]]
            if before.get("target_date") and after.get("target_date"):
                conflict = before["target_date"] > after["target_date"]
            if conflict:
                emit("warning", "dependency-timing", prefix, f"Prerequisite {a} is targeted later than {b}.")

    # Kahn's algorithm avoids recursion limits for large prerequisite graphs.
    indegree = {key: 0 for key in graph}
    for targets in graph.values():
        for target in targets:
            indegree[target] += 1
    queue = [key for key, degree in indegree.items() if degree == 0]
    processed = 0
    for key in queue:
        processed += 1
        for target in graph[key]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if processed != len(graph):
        emit("error", "dependency-cycle", ["dependencies"], "The hard prerequisite graph contains a cycle; inspect requires links among: " + ", ".join(key for key, degree in indegree.items() if degree > 0) + ".")

    for name in ("risks", "decisions_needed"):
        for i, item in enumerate(data["reporting"].get(name, [])):
            for j, key in enumerate(item["milestone_ids"]):
                reference(key, milestones, ["reporting", name, i, "milestone_ids", j], "milestone")
            if name == "decisions_needed" and as_of and item["status"] == "open" and item["due_date"] < as_of.isoformat():
                emit("warning", "overdue-decision", ["reporting", name, i], "This open decision is past its due date.")

    diagnostics.sort(key=lambda item: item.line or 0)
    return ValidationResult(data, source, diagnostics)
