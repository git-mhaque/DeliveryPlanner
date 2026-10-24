# Delivery Planner v1 verification

Verified on 24 October 2026.

## Outputs

- [North Star Platform Delivery Plan](../Plans/north-star-platform/delivery_plan.html)
- [Maintained YAML](../Plans/north-star-platform/plan.yaml)
- [Skill entrypoint](../Skills/delivery-planner/SKILL.md)
- [Implementation specification](delivery-planner-spec.md)

The maintained example has 24 milestones, four streams, six teams, three explicitly dated periods, 21 unique epic keys, and 21 dependency relationships. It includes all five statuses, all three dependency kinds, shared epics, three unplanned milestones, one milestone without an epic, crowded cells, and an empty stream/period cell. Its reporting date is fixed at 24 October 2026. All content is fictional.

## Run locally

From the repository root, install the locked environment once:

```sh
uv sync --frozen --project Skills/delivery-planner
```

Then run the engine directly. Substitute the absolute path of your checkout for `/path/to/DeliveryPlanner`:

```sh
Skills/delivery-planner/.venv/bin/python Skills/delivery-planner/scripts/delivery_planner.py --root /path/to/DeliveryPlanner validate north-star-platform
Skills/delivery-planner/.venv/bin/python Skills/delivery-planner/scripts/delivery_planner.py --root /path/to/DeliveryPlanner update north-star-platform
Skills/delivery-planner/.venv/bin/python -m pytest Skills/delivery-planner/tests -q
```

Create uses a display name; other operations use the exact plan folder ID. Publish accepts a configured destination or `--to`. The North Star source intentionally leaves publication unconfigured; publication was tested only in disposable temporary folders.

## Automated checks

43 passing tests cover:

- Schema validity and the maintained example, which validates with no errors or warnings.
- Required dates, valid status/tag/kind/view values, unknown fields, and direct epic keys.
- Duplicate YAML keys, aliases, duplicate entity IDs, dangling references, overlapping dates, out-of-period targets, self-links, duplicate edges, and hard dependency cycles.
- Soft cycles, shared epic keys, empty epic arrays, reporting-date-based overdue warnings, and prerequisite timing/completion warnings.
- Draft creation, collision prevention, path rejection, symlink rejection, and publish completeness.
- Identical HTML bytes from repeated generation, source fingerprints, and no external script or stylesheet references.
- Correct handling of authored HTML and script-terminator strings as data.
- Fresh regeneration before Publish; unchanged previous local/published output after validation failures; preservation on simulated rendering and atomic replacement failures.
- CLI execution independent of current working directory and valid enum comments in the scaffold.

The skill package also passes the bundled skill validator. JavaScript passes `node --check`.

## Browser checks

Inspected the generated HTML through a localhost-only server in the Codex browser:

- Delivery View displays all 24 cards across the dated periods and four lanes.
- Show dependencies renders all 21 relationships, with no invalid SVG coordinates.
- Milestone details show outcomes, owners, exact targets, epic keys, and incoming/outgoing relationships.
- Selected cards can be cleared; search with no matches produces an empty result; Reset restores the complete view.
- Executive View displays eight selected milestones and all five delivery exceptions, including one outside the executive roadmap. Filtering to Blocked leaves one executive roadmap card while retaining all five full-plan exceptions.
- Backlog Epic View contains 21 epic groups plus the unlinked-milestone group. Filtering to PLAT-201 produces one group with three milestones across three periods, with unique counts.
- Keyboard arrow navigation switches tabs. Native controls and modal focus handling are available.
- Desktop and 390-pixel viewport checks showed no page-wide horizontal overflow. The narrow roadmap scrolls within its own container.
- Redwood styling uses warm neutrals, a compact title, underlined tabs, and consistent status badges. The reporting date, Print / PDF, and settings icon sit beside view navigation. The dark banner and office branding have been removed.
- Count cards, search/filters, programme health, the summary, and the inactive result strip are hidden on initial load. The desktop roadmap begins about 138 pixels from the top at a 1440-pixel viewport width.
- Display settings independently enables all four optional panels across the three views. Hide all restores the compact layout. Close, Done, and Escape dismiss the overlay and restore focus to its trigger. Reload resets the settings.
- Hiding the controls with PLAT-201 selected preserves the one-epic, three-milestone result and its visible Clear filters action. Clearing restores all 22 groups (21 epic groups plus unlinked milestones) and hides the inactive result strip.
- Dependency display still renders 21 valid relationships after enabling count cards. Selecting and clearing a milestone correctly shows and hides the selection summary.
- Delivery and Executive roadmaps start directly with period headings. Show dependencies and Clear selection are outside the board beside the view controls. Dependency state survives view switches; roadmap controls are hidden in Backlog Epic View. Clearing a selection returns focus to Show dependencies.
- The compact toolbar and settings overlay were inspected at a 390-pixel viewport width. The dialog fits inside the viewport and the page has no horizontal overflow.
- No JavaScript errors were reported during the inspected interactions.

## Remaining manual browser checks

The browser tool accepts HTTP(S) pages but blocks `file:` URLs. The artifact is self-contained, but direct disk opening was not exercised through that tool. Open the HTML in a regular browser to confirm local-file behavior in the target environment.

Print/PDF uses the browser's print function and includes dedicated print styles, expanded epic groups, reporting context, and textual dependency lists. The embedded preview did not expose a print dialog, so actual print pagination and PDF output across the three views remain manual checks. No PDF export is claimed as verified.

Broader browser compatibility and screen-reader testing remain future checks. The current tests exercise the Python engine and a Chromium-based embedded preview.
