# Delivery plan data model

`plan.yaml` contains all authored delivery data. The schema is [plan.schema.json](plan.schema.json). The HTML renderer never rewrites YAML, so edit comments remain intact.

## Required objects

- `schema_version: 1`.
- `plan`: `id`, `title`, and `as_of` (ISO date or null for a draft); optional summary and reporting owner.
- `periods`: ordered records with `id`, `label`, inclusive `start`/`end` ISO dates. Dates are explicit; labels never define the fiscal calendar.
- `streams`: ordered records with `id`, `title`, optional description.
- `teams`: records with `id` and `name`.
- `milestones`: required `id`, `title`, `stream`, `target_period`, `status`, `tag`, `epic_ids`; optional `owner_team`, `contributing_teams`, named `owner`, `outcome`, `notes`, `target_date`, `executive_visible`.
- `dependencies`: `from`, `to`, `kind`, optional explanatory `note`.
- `reporting`: optionally overall health, health explanation, highlights, changes, risks, and decisions.
- `view`: `default_audience` and `show_dependencies`.
- `publish`: `directory`, initially null.

Entity IDs use lowercase letters, digits, and hyphens, start with a letter, and have at most 100 characters. `plan.id` matches the folder. Titles can change without breaking references. Top-level arrays are present even when empty. Unknown fields, duplicate YAML keys, and YAML aliases are rejected. Quote ISO dates in authored examples; plain ISO dates are also loaded as strings.

## Enum choices

Keep these comments beside editable values:

```yaml
status: not_started # Valid options: not_started, on_track, at_risk, blocked, done
tag: planned # Valid options: planned, unplanned
kind: requires # Valid options: requires, enables, relates_to
overall_health: unknown # Valid options: on_track, at_risk, blocked, unknown
severity: medium # Valid options: low, medium, high
default_audience: delivery # Valid options: delivery, executive, backlog_epic
show_dependencies: false # Valid options: true, false
executive_visible: false # Valid options: true, false
```

The block above lists independent field examples. For `status` inside a decision record, use:

```yaml
status: open # Valid options: open, resolved
```

`not_started` means work has not started; `on_track` means progressing toward the target; `at_risk` means the target or outcome is threatened; `blocked` means an unresolved prerequisite/action prevents progress; `done` means the outcome is complete. Add explanatory `notes` for risk or blocked states. Planned/unplanned describes scope origin, independently of status.

## Epics and ownership

```yaml
id: pilot-ready
epic_ids: [SEARCH-101, E2041] # Direct Jira/Rally keys; [] is valid.
```

Use exact keys as epic IDs, with no separate epic list. A key may appear on multiple milestones; a milestone may reference multiple keys. Duplicate keys within one array are invalid. Unlinked milestones are valid and appear in a dedicated group. If separate tracker instances reuse a key, consistently prefix only those ambiguous keys with an explicit namespace such as `jira-main:SEARCH-101`.

The Backlog Epic View is derived in order of first appearance. It shows milestone ownership/statuses, not inferred epic ownership or live tracker status. Only referenced epics appear. The first release displays keys as text.

Each milestone has one accountable `owner_team` and optional contributing team references. Teams and streams are independent.

## Dependencies and dates

- `requires`: `from` must complete before `to` can complete. This does not prevent overlapping work. Hard prerequisite cycles are invalid.
- `enables`: `from` helps `to`, without a mandatory completion constraint. Soft cycles are allowed.
- `relates_to`: undirected context or coordination. Reverse duplicates are invalid.

An edge connects two different milestone IDs. One kind per ordered pair; an undirected edge also excludes a duplicate relationship in the other direction. Later prerequisite periods or exact target dates create warnings, not automatic rescheduling. A completed milestone with an unfinished hard prerequisite also warns.

Periods are chronological and non-overlapping. Gaps warn. Exact milestone target dates fall within their target period. Without an exact date, the period end is the deadline for overdue warnings. All time comparisons use `plan.as_of`; neither rendering nor browser opening uses the wall clock to change business status.

## Reporting

`reporting.overall_health` and `health_note` are authored assessments. Highlights and changes are arrays of strings. Counts do not imply a percentage of effort completed.

Each risk has `id`, `title`, `severity`, `owner`, `milestone_ids`, and `mitigation`. Each decision has `id`, `title`, `owner`, `due_date`, `status`, `milestone_ids`, and `ask`. References must identify existing milestones; empty `milestone_ids` arrays allow programme-level records.

Executive View shows `executive_visible: true` outcomes plus authored reporting. A full-plan exception list always exposes at-risk and blocked milestones, including those outside the executive roadmap or filters.

## Drafts and publishing

Create produces a valid empty draft. Update can render it, but publishing requires a reporting date and at least one period, stream, and milestone. `publish.directory` is an absolute or workspace-relative local/mounted folder; `--to` overrides it without editing YAML. Output is `<destination>/<plan-id>/delivery_plan.html`. Runtime publishing does not transmit messages or deploy remote sites.
