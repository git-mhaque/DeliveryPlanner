# Delivery Planner contributor instructions

These instructions apply throughout this repository.

## Project layout

- `Skills/delivery-planner/` contains the reusable skill, CLI, schema, templates, and tests.
- `.agents/skills/delivery-planner` links to the canonical skill directory. Keep the implementation in `Skills/`.
- `Plans/<plan-id>/plan.yaml` is the source of truth for a plan. `delivery_plan.html` is generated output.
- `Plans/north-star-platform/` is the maintained fictional example, titled **North Star Platform Delivery Plan**.
- `docs/` contains the specification, verification notes, and preview images.

Read `Skills/delivery-planner/SKILL.md` for plan operations and `references/data-model.md` within that skill before changing plan data. Keep documentation aligned with implemented behavior.

## Implementation rules

- Use the bundled CLI for Create, Validate, Update, and Publish. Pass the workspace root explicitly.
- Edit shared templates instead of hand-editing generated HTML. Regenerate the maintained example when templates or rendering behavior change.
- Preserve deterministic output: the same YAML and renderer inputs must produce identical HTML bytes. Use `plan.as_of`, not the current clock, for delivery-date calculations.
- Keep HTML self-contained and usable offline. Avoid external fonts, scripts, stylesheets, and runtime service dependencies.
- Preserve YAML enum comments, stable milestone IDs, and direct epic keys in `epic_ids`. Do not introduce a separate epic registry.
- Treat plan content as data. Escape authored text and preserve safe YAML parsing and reference validation.
- Keep sample data fictional and documentation free of internal product names and vendor branding.
- Preserve the Redwood visual theme and compact header. When enabled, programme health appears as a compact badge beside the title, with its assessment available on click. Count cards, search/filters, programme health, and the plan summary are hidden by default. All are controlled through Display settings.
- Display settings last until reload and apply across all views. Never conceal active filters without retaining visible filter context and a way to clear them.
- Maintain keyboard access, visible focus, responsive layouts, and print reporting context.

## Verification

Use the existing virtual environment. If setup is needed, run `uv sync --frozen --project Skills/delivery-planner` from the repository root.

Run checks appropriate to the change:

```sh
Skills/delivery-planner/.venv/bin/python -m pytest Skills/delivery-planner/tests -q
node --check Skills/delivery-planner/assets/templates/plan.js
Skills/delivery-planner/.venv/bin/python Skills/delivery-planner/scripts/delivery_planner.py --root "$PWD" validate north-star-platform
Skills/delivery-planner/.venv/bin/python Skills/delivery-planner/scripts/delivery_planner.py --root "$PWD" update north-star-platform
git diff --check
```

For engine or template changes, run the existing tests and regenerate the example. For JavaScript changes, also check syntax. Inspect changed UI behavior in a browser, including narrow layouts and affected dependency/filter interactions. Update previews when the appearance changes. Do not claim browser or print checks that were not performed. Documentation-only changes do not require rerunning the engine tests.

## Commit convention

Use Conventional Commit style, with `ui` as an additional project-specific type:

```text
<type>(<optional-scope>): <imperative summary>
```

Use lowercase types and scopes, a concise imperative subject, and no trailing period. Common types:

| Type | Use |
| --- | --- |
| `feat` | New product or CLI functionality |
| `fix` | A correction to existing behavior |
| `ui` | Layout, visual styling, or presentation interactions |
| `docs` | Documentation and contributor instructions |
| `refactor` | Code restructuring without changing behavior |
| `test` | Tests and test infrastructure |
| `perf` | Performance improvements |
| `build` | Build tooling or dependency configuration |
| `ci` | Continuous integration changes |
| `chore` | Other repository maintenance |
| `revert` | Reverting an earlier change |

Examples:

```text
feat(cli): add a publication destination override
fix(validation): reject overlapping periods
ui(planner): simplify the header and add display settings
docs: document the delivery planner workflow
```

Use `!` after the type/scope and a `BREAKING CHANGE:` footer for incompatible changes. Add a body when the reason, behavior, or validation needs explanation. Prefer focused commits and include regenerated artifacts and relevant documentation with their source changes. Do not rewrite existing commits solely to change their notation.

Before committing, inspect the staged diff and exclude virtual environments, caches, credentials, and unrelated files. After committing, verify the commit and working-tree status. Do not push or publish externally unless requested.
