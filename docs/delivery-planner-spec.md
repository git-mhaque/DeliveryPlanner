# Delivery Planner Skill Specification

Status: Implemented v1.0.0; see [verification notes](verification.md) for checked behavior and remaining manual checks  
Date: 2026-10-24  
Skill name: `delivery-planner`

## 1. Purpose

Create a reusable AI skill for complex delivery planning across multiple teams, work streams, and time periods. Generate a portable visual plan that supports delivery coordination, executive communication, and inspection by backlog epic.

The AI interprets the user's request and invokes deterministic code. All four operations—Create, Validate, Update, and Publish—are implemented in scripts. YAML is the authoritative source for plan data, reporting commentary, visual defaults, and publishing configuration.

The main roadmap follows the supplied sketch: time periods form columns, streams form horizontal lanes, milestones appear as cards, and dependency connections can be shown or hidden.

## 2. Agreed requirements

- Use `Plans/` for plan instances and `Skills/` for the reusable skill and its code.
- Store all authored data for each plan in one `plan.yaml` file.
- Name the generated artifact **`delivery_plan.html`**.
- Require a start date and end date for every defined time period.
- Support the milestone statuses Not started, On track, At risk, Blocked, and Done.
- Include comments listing valid enum values in generated YAML templates and examples.
- Support planned and unplanned milestones.
- Represent dependencies using stable milestone IDs and documented relationship kinds.
- Include an `epic_ids` array on every milestone for related Jira or Rally epic keys. Each key is the epic's ID; no separate epic collection is maintained.
- Provide Delivery View, Executive View, and Backlog Epic View in the same HTML artifact.
- Apply the Redwood visual theme consistently across all three views and generated plans.
- After implementing the skill, use it to create and render a realistic fictional public example plan. Retain that plan for ongoing development and regression checks.

## 3. Scope and boundaries

The first release provides a period-based roadmap and communication artifact. A milestone represents a delivery outcome, with a target completion period. It is not a duration bar or an automatically scheduled task.

Streams describe categories of work; teams describe organizational ownership. A team can contribute to several streams, and a milestone can have one accountable team plus multiple contributing teams.

The engine does not infer delivery status, automatically move dates, calculate a critical path, fetch live Jira/Rally data, or write executive commentary. The AI may help the user edit YAML, but those edits become explicit inputs before regeneration.

Publishing copies the generated HTML into a designated local or mounted folder. Email, messaging, remote-site deployment, and tracker synchronization are outside the first release.

## 4. Directory structure

```text
Root/
├── Plans/
│   ├── delivery-plan-a/
│   │   ├── plan.yaml
│   │   └── delivery_plan.html
│   └── north-star-platform/
│       ├── plan.yaml
│       └── delivery_plan.html
├── Skills/
│   └── delivery-planner/
│       ├── SKILL.md
│       ├── agents/
│       │   └── openai.yaml
│       ├── scripts/
│       │   ├── delivery_planner.py
│       │   └── planner/
│       │       ├── validation.py
│       │       ├── rendering.py
│       │       └── publishing.py
│       ├── references/
│       │   ├── plan.schema.json
│       │   └── data-model.md
│       ├── assets/
│       │   ├── skeleton.yaml
│       │   └── templates/
│       │       ├── plan.html.j2
│       │       ├── plan.css
│       │       └── plan.js
│       ├── tests/
│       ├── pyproject.toml
│       └── uv.lock
├── docs/
│   └── delivery-planner-spec.md
└── .agents/
    └── skills/
        └── delivery-planner -> ../../Skills/delivery-planner
```

The HTML file appears after Update or Publish succeeds; Create writes the YAML scaffold. Tests may use temporary fixtures, but the public example remains the maintained example under `Plans/`.

Codex discovers repository skills in `.agents/skills` and supports symlinked skill directories. The symlink preserves `Skills/` as the implementation location. See the [official OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills).

## 5. Commands and behavior

The skill accepts natural-language requests and invokes these CLI operations. Plan arguments resolve to an exact folder under the configured workspace root; ambiguous plan names must be resolved before invoking the command.

```text
delivery-planner create "North Star Platform"
delivery-planner validate north-star-platform
delivery-planner update north-star-platform
delivery-planner publish north-star-platform
delivery-planner publish north-star-platform --to /designated/folder
```

These command names describe the operations. The executable entry point is `Skills/delivery-planner/scripts/delivery_planner.py`, run with the skill virtual environment’s Python interpreter and `--root <workspace>` before the subcommand. See [the skill instructions](../Skills/delivery-planner/SKILL.md) for exact invocations. The skill supplies an explicit workspace root, so behavior does not depend on the invoking shell's current directory.

### Create

- Derive a stable lowercase, hyphenated plan ID and directory name from the supplied name. Reject an empty result, path traversal, and collisions.
- Create `Plans/<plan-id>/plan.yaml` from a maintained template.
- Write the supplied title, stable ID, empty data arrays, a null reporting date, and documented defaults.
- Include adjacent comments for valid statuses, tags, dependency kinds, and views. Explain that `epic_ids` accepts direct Jira/Rally keys. Keep commented object examples available for the first entries in empty arrays.
- Do not invent teams, fiscal dates, delivery facts, or a publication destination.
- Refuse to overwrite an existing plan directory.

An empty scaffold is structurally valid but produces completeness warnings. Required period dates apply to every period object once one is added.

### Validate

- Parse YAML safely and reject duplicate mapping keys and aliases. Use explicit records for predictable validation paths.
- Validate the versioned schema, references, dates, relationships, and consistency rules.
- Report errors and warnings with the relevant YAML path and stable object ID; include line numbers when available.
- Make no changes to input or output files.
- Return success when there are warnings but no errors. Offer machine-readable diagnostics alongside human-readable output.
- Evaluate time-dependent warnings against `plan.as_of`, never the machine's current date.

### Update

- Validate the plan and stop on errors.
- Render all three views into `Plans/<plan-id>/delivery_plan.html`.
- For an incomplete scaffold, render a clearly labeled draft with useful empty states.
- Replace the existing artifact atomically only after successful generation.
- Preserve the previous artifact when validation or rendering fails.
- Do not rewrite YAML or discard its comments.

### Publish

- Resolve the destination from `--to`, otherwise `publish.directory`. An override applies only to that invocation.
- Resolve relative destinations against the workspace root. Require an explicit configured destination; do not guess one.
- Require a reporting date, at least one period, one stream, and one milestone. Other validation warnings remain visible and do not silently change delivery data.
- Validate and generate from the current YAML before publishing, preventing stale output from being copied.
- Publish to `<destination>/<plan-id>/delivery_plan.html`, keeping plans with the same artifact filename separate.
- Atomically replace only that plan's artifact and preserve the previous published file if publishing fails.
- Copy the HTML artifact only. Return the exact destination and source fingerprint.

Updating the local artifact and publishing it are separate atomic operations. A publication failure may leave a successfully refreshed local artifact while the previous published version remains intact.

## 6. YAML data model

All collection IDs are unique within their entity type and remain stable when titles change. All references are within a single plan in the first release.

| Collection or object | Required data | Optional data / behavior |
| --- | --- | --- |
| `schema_version` | Integer `1` | Future changes require an explicit migration |
| `plan` | `id`, `title`, `as_of` | Summary, reporting owner; `as_of` may be null in a draft |
| `periods[]` | `id`, `label`, `start`, `end` | ISO date strings; list order is chronological display order |
| `streams[]` | `id`, `title` | Description; list order is display order |
| `teams[]` | `id`, `name` | Stable references independent of stream membership |
| `milestones[]` | `id`, `title`, `stream`, `target_period`, `status`, `tag`, `epic_ids` | Owner team, contributing teams, named owner, outcome, notes, target date, executive visibility |
| `dependencies[]` | `from`, `to`, `kind` | Explanation in `note` |
| `reporting` | Object, possibly empty | Overall health, health explanation, highlights, changes, risks, decisions |
| `view` | `default_audience`, `show_dependencies` | Defaults embedded in HTML |
| `publish` | `directory` | Null until configured |

Top-level collections are present even when empty. Unknown fields are rejected so misspellings do not silently remove information from the output.

### Milestone statuses and tags

| YAML status | Display label | Meaning |
| --- | --- | --- |
| `not_started` | Not started | Work toward the outcome has not started |
| `on_track` | On track | Work is progressing with the current target expected to hold |
| `at_risk` | At risk | There is a material risk to the target or outcome |
| `blocked` | Blocked | Progress requires an unresolved prerequisite, decision, or action |
| `done` | Done | The stated outcome is complete |

Tags are `planned` and `unplanned`. An unplanned item can be on track or done; the tag is independent of status. The engine never changes statuses from dates or dependency states.

`executive_visible` defaults to false. `epic_ids` is always an array and can be empty. `contributing_teams` defaults to an empty array.

### Period dates

- Every period has explicit `YYYY-MM-DD` start and end strings, both inclusive.
- Start must be on or before end; periods must be ordered and must not overlap.
- Gaps between periods are permitted and produce a warning.
- Fiscal labels are display text. Dates are never inferred from `Q2 FY27` or other labels.
- An optional milestone `target_date` must fall inside its target period. Otherwise, the period end acts as the coarse completion deadline for overdue warnings.
- The reporting date can fall outside the displayed horizon; show a warning instead of rejecting retrospective or future plans.
- Overdue warnings require an unfinished milestone and a deadline earlier than `plan.as_of`.
- Milestone order within a stream/period cell follows YAML list order. Calendar precision does not imply fine-grained scheduling or capacity planning.

### Epic keys stored only on milestones

`epic_ids` contains direct, case-sensitive tracker keys, such as `SEARCH-101` or `E2041`. The key itself is the epic's ID. There is no top-level `epics` collection, second definition, or required title, owner, system, or URL for an epic.

Keys are opaque, nonempty strings without leading or trailing whitespace. Do not guess tracker type from their shape or impose a Jira-specific pattern on Rally keys. The first release validates the local format, not whether a key exists or represents an epic in a live tracker. Missing external metadata is normal and produces no warning.

The same key can appear on several milestones, and a milestone can contain several keys. Duplicate keys within one milestone's array are errors. An empty array is valid for work without an associated epic.

The renderer derives the epic index by walking milestones in YAML order and grouping exact key matches. Groups follow the keys' first appearance; linked milestones follow YAML order. This derived index exists only during generation and is not written back as a second collection.

Milestone IDs remain separate from epic keys: a milestone is a delivery outcome and an epic can span several outcomes or periods. Dependencies continue to reference milestone IDs, not epic keys.

If two tracker instances use the same key for different epics, consistently namespace those entries directly in `epic_ids`, for example `jira-main:SEARCH-101`. Plain keys remain the default; namespacing does not require a registry.

An epic appears in the plan only when at least one milestone references it. Epics without any milestone association remain in the source tracker. The first release displays keys as text; tracker titles, statuses, and clickable external links require a separately designed enrichment or link configuration extension.

## 7. Dependency kinds

Use general endpoints `from` and `to` to support both directional and undirected relationships. This replaces the earlier illustrative `prerequisite` and `dependent` field names; no existing data migration is needed for this new project.

| Kind | Meaning | Direction and display | Validation effect |
| --- | --- | --- | --- |
| `requires` | The `to` milestone cannot be completed until the `from` milestone is complete | Prerequisite → dependent; solid arrow | Hard prerequisite graph must be acyclic; completion and timing conflicts produce warnings |
| `enables` | Completing `from` helps or unlocks an opportunity for `to`, but is not a mandatory completion condition | Enabler → beneficiary; dashed arrow | No hard-blocking inference or hard cycle constraint |
| `relates_to` | Items share context or coordination needs without a completion prerequisite | Undirected dotted line | Reference validation only; reciprocal duplicates are rejected |

For example, an indexing foundation may be required for a search pilot, tooling automation may enable a rollout without being mandatory, and documentation may relate to that rollout without constraining completion.

- All kinds require existing, distinct milestone endpoints.
- A pair has one relationship kind. Changing a soft relationship to a hard prerequisite replaces the edge instead of adding another connector.
- Opposing directional edges are distinct, but two opposing `requires` edges form an invalid cycle. An undirected relation cannot duplicate an existing connection in either direction.
- Only `requires` edges participate in hard cycle detection and prerequisite consistency checks.
- A hard prerequisite targeted to a later period than its dependent produces a warning. If both have exact target dates, use those dates for the check. Two items in one period without exact dates do not imply a conflict.
- A done milestone with an unfinished hard prerequisite produces a warning, never an automatic status correction.
- Hiding dependency lines does not disable validation.

Traditional scheduling relations—finish-to-start, start-to-start, finish-to-finish, and start-to-finish—are deferred. They need activity start/end semantics. The first-release `requires` relation is specifically a completion prerequisite; it does **not** prohibit overlapping work or mean finish-to-start scheduling.

## 8. Illustrative YAML

The following is a small fictional example of the contract, not the full public example. It assumes an example fiscal year running June through May, named by its ending year. These dates are explicit sample choices, not an assertion about a real organization's calendar.

```yaml
schema_version: 1

plan:
  id: north-star-platform
  title: North Star Platform Delivery Plan
  as_of: "2026-10-24" # ISO date; null is allowed in a draft.
  reporting_owner: Sample Programme Lead
  summary: "A fictional programme improving search relevance, scale, and trust."

periods:
  - id: q2-fy27
    label: Q2 FY27
    start: "2026-09-01"
    end: "2026-11-30"
  - id: q3-fy27
    label: Q3 FY27
    start: "2026-12-01"
    end: "2027-02-28"
  - id: q4-fy27
    label: Q4 FY27
    start: "2027-03-01"
    end: "2027-05-31"

streams:
  - { id: features, title: Feature Delivery }
  - { id: platform, title: Platform }
  - { id: security, title: Security }

teams:
  - { id: search, name: Search Experience }
  - { id: infrastructure, name: Platform Engineering }

milestones:
  - id: indexing-foundation
    title: Indexing foundation ready
    stream: platform
    target_period: q2-fy27
    owner_team: infrastructure
    contributing_teams: []
    status: done # Valid options: not_started, on_track, at_risk, blocked, done
    tag: planned # Valid options: planned, unplanned
    epic_ids: [E2041] # Direct Jira/Rally epic keys; use [] when there are none.
    outcome: "A scalable foundation is available for pilot integration."
    executive_visible: true

  - id: search-pilot
    title: Search pilot available
    stream: features
    target_period: q3-fy27
    owner_team: search
    contributing_teams: [infrastructure]
    status: on_track # Valid options: not_started, on_track, at_risk, blocked, done
    tag: planned # Valid options: planned, unplanned
    epic_ids: [SEARCH-101, E2041] # Keys may be shared by multiple milestones.
    outcome: "Pilot users can validate relevance and usability."
    executive_visible: true

dependencies:
  - from: indexing-foundation
    to: search-pilot
    kind: requires # Valid options: requires, enables, relates_to
    note: "Pilot completion requires the indexing foundation."

reporting:
  overall_health: on_track # Valid options: on_track, at_risk, blocked, unknown
  health_note: "The fictional pilot remains within the planned delivery window."
  highlights:
    - "Indexing foundation is ready for integration."
  changes_since_last_report:
    - "Foundation milestone moved to Done."
  risks:
    - id: representative-test-data
      title: Representative pilot data may arrive late
      severity: medium # Valid options: low, medium, high
      owner: Sample Pilot Lead
      milestone_ids: [search-pilot]
      mitigation: "Prepare a synthetic dataset as a fallback."
  decisions_needed:
    - id: pilot-cohort
      title: Confirm the initial pilot cohort
      owner: Sample Product Lead
      due_date: "2026-11-06"
      status: open # Valid options: open, resolved
      milestone_ids: [search-pilot]
      ask: "Select the first two fictional pilot teams."

view:
  default_audience: delivery # Valid options: delivery, executive, backlog_epic
  show_dependencies: false # Valid options: true, false

publish:
  directory: null # Set a local/mounted directory; relative paths use the workspace root.
```

Templates must retain these enum comments beside editable values. Generated HTML is derived output; the renderer never round-trips YAML and therefore cannot remove its comments.

## 9. Views and interaction

### Visual theme

Use the Redwood visual theme: warm neutral canvas and white cards, charcoal text, pine and teal accents, restrained sienna highlights, clear sans-serif typography, subtle borders, and modest corner radii. Selected tabs use an underline. Status badges retain readable text labels alongside colour. Keep the header compact with the plan title and view navigation; omit the dark application banner and office branding. Place the reporting snapshot, Print / PDF, and a settings icon alongside the view tabs, wrapping neatly on narrow screens.

Maintain these styles in the shared renderer templates, so every generated plan inherits the same design. Use system fonts and inline assets to preserve offline portability. Keep vendor branding out of plan content and project documentation.

### Shared behavior

- Show plan title, reporting date, and view navigation.
- Provide an accessible Display settings overlay with independent toggles for count cards, search and filters, programme health, and the plan summary. All four are hidden by default, including before JavaScript initializes. Provide Hide all, close, and Escape actions, and restore focus to the settings button on dismissal.
- Apply display settings across all three views for the current page session. Reloading returns to the compact defaults. Settings do not change YAML, delivery data, or the generated artifact.
- Hiding search/filter controls preserves active filters. Retain a visible result summary and Clear filters action whenever filters are active; retain selection context while a milestone is selected. Otherwise hide the result strip when filter controls are hidden.
- Optional panels remain hidden in print unless enabled. Keep the reporting date and any active filter context in printed output. Executive risks, decisions, and exception reporting remain core view content.
- Include a legend with status and relationship meanings. Use text or icons as well as colour.
- Keep browser view/filter changes local to the current page session; they do not edit YAML.
- Support keyboard navigation, visible focus, readable contrast, and card details accessible without hover.
- Escape authored text. YAML strings are displayed as data, never executed as HTML, JavaScript, or instructions.
- Include all assets in the HTML; opening the file must not require a server, CDN, tracker login, or network request.
- On narrow screens, allow horizontal roadmap scrolling and retain clear period/stream labels.
- Provide print styling for each view, including reporting date, active filters, and readable content. Paginate dense plans rather than clipping them or shrinking text beyond readability.
- View selection changes presentation, not access control. The portable HTML contains the plan's data.

### Delivery View

- Display all streams across all periods, including empty cells.
- Show milestone title, status, planned/unplanned tag, owner team, and related epic keys on cards or in accessible details depending on available space.
- Offer filters for stream, owner/contributing team, status, tag, and epic.
- Show outcome, notes, exact target date when present, ownership, epics, and incoming/outgoing relationships in card details.
- Include Show dependencies and selected-milestone dependency highlighting. Distinguish direct links from any transitive chain highlighting.
- Recalculate SVG connector positions after layout changes, filtering, resizing, and font/layout readiness. Connectors share the roadmap's scroll coordinate space.
- Route connections through available gutters where practical and avoid covering card text. Provide textual relationship lists even when arrows are hidden.
- Suppress lines to filtered-out cards and show that additional linked items are hidden, with a way to reveal them.

### Executive View

- Show the authored summary, reporting date, overall health and explanation, highlights, changes, risks, and decisions needed.
- Display milestone cards marked `executive_visible: true` in a compact roadmap. Preserve the same period dates and status meanings.
- Show open decisions with owners and due dates; resolved decisions remain available in details.
- Do not silently hide blocked or at-risk milestones excluded from the executive roadmap: include an exception count and a drill-through list covering all such milestones.
- Provide a textual dependency explanation when a selected executive milestone relies on a milestone omitted from that view.
- Label metrics as milestone counts. Do not convert counts into effort completion percentages or automatically derive overall programme health.
- If overall health or narrative commentary is absent, display “Not provided” rather than manufacturing a positive assessment.

### Backlog Epic View

- Derive one group for each distinct key found in milestone `epic_ids` arrays. No separately authored epic data is required.
- Use the key as the group heading. Show linked milestone titles, their owner/contributing teams, streams, target periods, milestone status counts, and planned/unplanned counts. Label teams as milestone ownership, not inferred epic ownership.
- Allow expansion into the actual linked milestones and navigation to their roadmap cards.
- Offer epic-key search and filters for team, stream, period, milestone status, and planned/unplanned tag. Do not infer tracker systems or offer tracker-system filters without explicit source data.
- Epics with no milestone references cannot appear in this derived view. Do not create placeholder milestones solely to list them.
- Place milestones with an empty `epic_ids` array in a “Milestones without an epic” group.
- A milestone linked to two epics appears in both groups. Totals across the plan deduplicate by milestone ID, and filtered counts are labeled.
- Display mixed milestone statuses as a distribution, not a guessed epic status. Roadmap information is not presented as live Jira/Rally state.
- A plan with no epic associations still renders a useful empty state and its “Milestones without an epic” group.

## 10. Validation rules

### Errors: stop Update and Publish

- Invalid YAML, duplicate mapping keys, unsupported schema version, unknown fields, invalid types, or invalid enum values.
- Empty required identifiers or titles, duplicate entity IDs, or empty, non-string, whitespace-padded, or duplicate keys within a milestone's `epic_ids`. Sharing an epic key across milestones is valid.
- Unknown stream, period, owner/contributing team, dependency endpoint, or reporting milestone reference. Epic keys are direct identifiers and do not require a local reference target.
- Missing/invalid period dates, start after end, overlapping or out-of-order periods, or a target date outside its period.
- Self-links, duplicate relationships, or cycles in the `requires` graph.
- Invalid reporting risk severity, decision status, or malformed reporting/decision dates.

### Warnings: render with diagnostics

- Empty draft collections or missing reporting date.
- Missing milestone owner, outcome, or executive coverage.
- Gaps between periods or a reporting date outside the plan horizon.
- Unfinished milestones overdue as of the reporting date; open decisions past their due date.
- Hard prerequisite timing conflicts or a done milestone with unfinished hard prerequisites.
- Missing explanatory notes for blocked or at-risk milestones.

Report warnings predictably in YAML/object order. Publish adds the completeness requirements described in section 5; validation warnings do not otherwise become undocumented publication blockers.

An empty `epic_ids` array and the absence of epic metadata produce no warning. The Backlog Epic View handles these cases explicitly.

## 11. Determinism and implementation

The reproducibility contract is:

> The same YAML bytes, engine/templates version, and explicit rendering options produce identical HTML bytes.

- Use stable list ordering, stable tie-breakers, fixed serialization rules, UTF-8, and consistent newlines.
- Use pinned runtime dependencies and a committed lockfile.
- Embed a source fingerprint and renderer version for traceability. Exclude machine paths, random IDs, and wall-clock generation timestamps from generated HTML.
- Use `plan.as_of` for the reporting snapshot and date-dependent diagnostics. The browser must not recompute business status using today's date.
- Browser layout can adapt to viewport size; byte reproducibility does not promise pixel-identical rendering across browsers.
- Keep the engine usable directly from the CLI without an AI session.
- Use one validation contract across all four commands; avoid separate implementations of the same business rule.

Recommended implementation: Python, a safe YAML loader with duplicate-key rejection, JSON Schema validation plus semantic checks, Jinja templates with appropriate escaping, CSS Grid, and a small JavaScript/SVG layer. Template CSS and JavaScript are inlined during generation. Rendering must safely serialize embedded data, including strings containing script terminators.

The schema is the executable source of structural rules. Document enum meanings in the data-model reference and check that commented template options stay consistent with the schema. The skill instructions remain short and route to the relevant references and commands.

## 12. Public example and development fixture

After the skill is functional, create `Plans/north-star-platform/` through its Create mode, populate the YAML, Validate it, and generate its `delivery_plan.html` through Update.

Use a fictional product named **North Star Platform**, with the plan title **North Star Platform Delivery Plan**. Use fictional or generic names throughout the specification, templates, and example; do not include internal plan or product names. All team names, epic keys, people/roles, outcomes, commentary, and status claims are invented for the example. Include “Fictional public example” in the authored plan summary, available through Display settings. Use synthetic epic keys stored directly on milestones; do not include internal links or copied project information.

The maintained example should contain:

- Three explicit fiscal periods: Q2 FY27 through Q4 FY27, with the sample June–May fiscal convention documented in YAML comments.
- Four streams: Feature Delivery, Platform, Security, and Adoption & Operations.
- Five or six fictional teams with contributions across streams.
- Approximately 20–24 milestones with meaningful outcome descriptions and believable sequencing.
- Every supported milestone status and both planned/unplanned tags.
- A small amount of unplanned work, such as a relevance regression or an infrastructure remediation, with visible impact and explanation.
- All three relationship kinds, including cross-team, cross-stream, same-period, and cross-period connections. Keep the hard prerequisite graph acyclic.
- Synthetic Jira and Rally epic keys stored only in milestone `epic_ids`; one milestone associated with multiple epics; one epic spanning multiple milestones and periods; and one milestone without an epic. No separate epic definitions are needed.
- Roughly six to eight executive-visible milestones, plus substantive highlights, changes, risks, and open/resolved decisions.
- A mix of short and long card titles and several crowded/empty cells to exercise realistic layouts.
- An explicit reporting date chosen to make the depicted states coherent and reproducible.

The normal example must validate with no errors. Any expected warnings, such as a deliberately overdue decision, should be understood and documented in YAML comments. Missing epic metadata and milestones without epics are supported normal cases, not warnings. Do not intentionally fill the normal example with contradictory dates or completed milestones whose hard prerequisites are unfinished; negative cases belong in isolated test fixtures.

Keep the example YAML and its generated HTML available for design review and continuing development. Regenerate the example after renderer changes. Automated tests must consume the maintained example or copies of it without modifying the source fixture. Publishing the public example to a remote site is a separate future action; creating a public-safe example does not itself publish it.

## 13. Delivery sequence

1. **Data contract:** Implement the schema, commented scaffold, dependency rules, and a small representative fixture.
2. **Core commands:** Implement Create and Validate, with exact plan resolution and useful diagnostics.
3. **Roadmap rendering:** Implement Update, Delivery View, responsive layout, card details, dependency drawing, and print behavior.
4. **Audience views:** Add Executive View, Backlog Epic View, all required filters, and empty/unlinked states.
5. **Publishing and packaging:** Implement Publish, atomic file handling, traceability, skill instructions, metadata, and local discovery.
6. **Realistic example:** Use the completed skill to create the maintained North Star Platform example; inspect all views and adjust the implementation against real layout pressure.
7. **Verification:** Run targeted integration and browser checks, validate the skill package, and establish the example as a continuing regression fixture.

## 14. Acceptance criteria

- Create produces the expected folder and commented YAML scaffold, without overwriting an existing plan.
- Every defined period requires valid start/end dates; fiscal labels do not determine dates.
- All five milestone statuses, both tags, and all dependency kinds render with clear labels and valid-option YAML comments.
- Validate catches duplicate IDs/keys, dangling references, invalid dates, invalid enums, hard dependency cycles, and duplicate epic associations.
- Update generates `delivery_plan.html`; repeated runs with identical inputs produce identical output bytes.
- Failed validation or rendering leaves the previous local HTML intact.
- The output opens directly from disk with no external asset requests and all three views function.
- Dependency connectors stay attached after filtering, resizing, and scrolling; hidden dependencies remain discoverable through text.
- Backlog Epic View is derived solely from milestone `epic_ids` and handles direct keys, shared epics, multiple epics per milestone, milestones without epics, plans with no epic associations, and deduplicated totals correctly.
- No separate epic collection, external metadata, or tracker lookup is required to validate, render, or publish a plan. Milestone dependencies remain independent of epic keys.
- Executive View preserves authored reporting, surfaces hidden delivery exceptions, and does not invent programme or epic health.
- Publish regenerates from current source, resolves the configured destination predictably, and preserves the previous published artifact on failure.
- Text containing HTML or JavaScript-like content renders as data and cannot execute.
- Browser checks cover the full example, crowded cells, long titles, keyboard navigation, narrow viewports, and print output in each view.
- The public example is realistic, fictional, reproducible, and retained as development data.
- The skill package validates and accurately routes Create, Validate, Update, and Publish requests to code.

## 15. Deferred extensions

- Published snapshots and automatic comparisons for scope additions, moved periods, status changes, and dependency changes.
- Cross-plan dependencies and portfolio rollups.
- Activity durations, conventional scheduling dependency types, capacity modeling, and critical-path calculation.
- Explicit Jira/Rally import or synchronization workflows with provenance and access configuration; optional epic title/status enrichment and tracker-link configuration without duplicating hand-maintained epic records.
- Separately generated PDF or slide exports and remote publishing integrations.

These extensions must preserve stable IDs, explicit inputs, and reproducible rendering. The current YAML snapshot can carry authored changes since the previous report, but cannot calculate historical changes without a previous snapshot.
