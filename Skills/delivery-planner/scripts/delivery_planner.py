#!/usr/bin/env python3
"""Create, validate, update, and publish a delivery plan."""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from planner.publishing import atomic_write, plan_directory, publish_html
from planner.rendering import render_plan
from planner.validation import SKILL_ROOT, read_plan


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,99}", value):
        raise ValueError("The name must produce a nonempty ID of at most 100 characters, starting with a letter.")
    if "/" in name or "\\" in name or name.strip() in (".", ".."):
        raise ValueError("The plan name must not contain a filesystem path.")
    return value


def create_plan(root, name):
    plan_id = slugify(name)
    directory = plan_directory(root, plan_id)
    directory.parent.mkdir(parents=True, exist_ok=True)
    directory.mkdir()  # Exclusively create; existing plans are never overwritten.
    template = (SKILL_ROOT / "assets/skeleton.yaml").read_text(encoding="utf-8")
    content = template.replace("__PLAN_ID__", plan_id).replace("__PLAN_TITLE__", json.dumps(name.strip(), ensure_ascii=False))
    try:
        atomic_write(directory / "plan.yaml", content.encode("utf-8"))
    except Exception:
        directory.rmdir()
        raise
    return directory / "plan.yaml"


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--root", type=Path, required=True, help="Explicit workspace containing Plans/")
    commands = result.add_subparsers(dest="command", required=True)
    for command in ("create", "validate", "update", "publish"):
        sub = commands.add_parser(command)
        sub.add_argument("plan", help="Display name for create; exact plan folder ID otherwise")
        sub.add_argument("--json", action="store_true", help="Machine-readable result and diagnostics")
        if command == "publish":
            sub.add_argument("--to", type=Path, help="Override the configured publication directory")
    return result


def run(args):
    root = args.root.resolve()
    if not root.is_dir():
        raise ValueError("Workspace root must be an existing directory.")
    if args.command == "create":
        path = create_plan(root, args.plan)
        return {"ok": True, "command": "create", "output": str(path), "diagnostics": []}, 0
    directory = plan_directory(root, args.plan)
    source = directory / "plan.yaml"
    if source.is_symlink():
        raise ValueError("plan.yaml must not be a symlink.")
    result = read_plan(source, for_publish=args.command == "publish")
    response = {"ok": result.valid, "command": args.command,
                "diagnostics": [item.to_dict() for item in result.diagnostics]}
    if not result.valid:
        return response, 1
    if result.data["plan"]["id"] != args.plan:
        raise ValueError("plan.id must match its plan directory name.")
    if args.command == "validate":
        return response, 0
    destination = None
    if args.command == "publish":
        configured = args.to if args.to is not None else result.data["publish"]["directory"]
        if not configured:
            raise ValueError("Set publish.directory or pass --to before publishing.")
        destination = Path(configured).expanduser()
        if not destination.is_absolute():
            destination = root / destination
        destination = destination.resolve()
        if destination == (root / "Plans").resolve():
            raise ValueError("Choose a publication directory separate from the source Plans directory.")
    content, fingerprint = render_plan(result)
    output = directory / "delivery_plan.html"
    atomic_write(output, content)
    if destination is not None:
        output = publish_html(destination, args.plan, content)
    response.update(output=str(output), source_fingerprint=fingerprint)
    return response, 0


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        response, code = run(args)
    except (OSError, ValueError) as exc:
        response, code = {"ok": False, "command": args.command, "error": str(exc), "diagnostics": []}, 2
    except Exception as exc:
        response, code = {"ok": False, "command": args.command, "error": f"Operation failed: {exc}", "diagnostics": []}, 2
    if args.json:
        print(json.dumps(response, ensure_ascii=False, indent=2))
    else:
        for item in response["diagnostics"]:
            position = f"line {item['line']}, " if item.get("line") else ""
            identifier = f" ({item['object_id']})" if item.get("object_id") else ""
            print(f"{item['severity'].upper()} [{item['code']}] {position}{item['path']}{identifier}: {item['message']}")
        if response.get("error"):
            print(response["error"], file=sys.stderr)
        elif response["ok"]:
            print(f"{args.command.capitalize()} succeeded." + (f" {response['output']}" if "output" in response else ""))
            if "source_fingerprint" in response:
                print(f"Source SHA-256: {response['source_fingerprint']}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
