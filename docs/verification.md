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

The skill package also passes the bundled skill validator. JavaScript passes `node --check`. The five Node geometry tests (`node --test Skills/delivery-planner/tests/graph-layout.test.cjs`) cover deterministic placement, measured-height collisions, period/stream bounds, routes avoiding unrelated nodes, dense undated data, soft cycles, empty/filtered layouts, and date-based positioning without source mutation.

## Browser checks

Inspected the generated HTML through a localhost-only server in the Codex browser:

- Delivery View displays 24 compact HTML nodes across dated periods and four full-width stream lanes. Floating stream labels replace the dedicated left column; subtle guides replace boxed cells.
- Show dependencies renders all 21 relationships as rounded orthogonal paths, with no invalid SVG coordinates. Geometry tests verify routes do not intersect unrelated card rectangles. Filtering to PLAT-201 leaves three nodes and one visible connection.
- Milestone details show outcomes, owners, exact targets, epic keys, and incoming/outgoing relationships.
- Selected cards highlight direct neighbours and dim unrelated nodes; selection can be cleared; search with no matches produces an empty result; Reset restores the complete view.
- Executive View displays eight selected milestones and all five delivery exceptions, including one outside the executive roadmap. Filtering to Blocked leaves one executive roadmap card while retaining all five full-plan exceptions.
- Backlog Epic View contains 21 epic groups plus the unlinked-milestone group. Filtering to PLAT-201 produces one group with three milestones across three periods, with unique counts.
- Keyboard arrow navigation switches tabs. Native controls and modal focus handling are available.
- Desktop and 390-pixel viewport checks showed no page-wide horizontal overflow. The narrow roadmap scrolls within its own container. At 390 pixels, a 120-pixel horizontal scroll kept the stream label 14 pixels inside the viewport edge.
- Redwood styling uses warm neutrals, a compact title, filled selected view chips, and consistent status badges. View chips, Print / PDF, and the settings icon sit at the top-right beside the title; the reporting date sits immediately right of programme health (or remains alone when health is hidden). Show dependencies is in Display settings. The dark banner and office branding have been removed.
- Programme health, count cards, search/filters, the summary, and the inactive result strip are hidden on initial load. When enabled, programme health appears beside the title as a 32-pixel-high badge.
- Display settings independently enables all four optional panels across the three views. Show all enables all five settings, including dependency lines. Hide all disables them; a selected milestone can still show its direct connections until selection is cleared. Close, Done, and Escape dismiss the overlay and restore focus to its trigger. Reload resets the four panel settings and restores the YAML dependency preference (checked in the maintained example).
- Hiding the controls with PLAT-201 selected preserves the one-epic, three-milestone result and its visible Clear filters action. Clearing restores all 22 groups (21 epic groups plus unlinked milestones) and hides the inactive result strip.
- Dependency display still renders 21 valid relationships after enabling count cards. Selecting and clearing a milestone correctly shows and hides the selection summary.
- Delivery and Executive roadmaps start directly with period headings. Show dependencies is in Settings; Clear selection sits beside selection context. Dependency state survives view switches. Clearing a selection returns focus to the view content and hides the inactive context row.
- The compact toolbar and settings overlay were inspected at a 390-pixel viewport width. The dialog fits inside the viewport and the page has no horizontal overflow.
- The graph uses existing normal scrolling; pan/zoom and drag editing are not implemented.
- Print / PDF and Settings align at the top-right on desktop. At 390 pixels they sit above the title without overlap; the health badge wraps below the title, and dismissing settings returns focus to its relocated button.
- Clicking programme health opens its full assessment. Close and Escape dismiss the dialog, and Escape returns focus to the badge. At 390 pixels the assessment dialog fits inside the viewport (337 pixels wide), with no page-wide horizontal overflow. Dependency lines still render after the header change.
- At 1920 pixels, the date is 10 pixels to the right of the health badge. At 390 pixels both remain together below the title without page-wide horizontal overflow. The date remains visible with health hidden. Show all renders all 21 dependency lines; Hide all followed by Clear selection removes the lines and selection context.
- Milestone overlays measure 520 × 680 pixels at a 1440 × 1000 viewport. Scrolling the body leaves the heading and footer fixed. At 390 × 844 the overlay fits inside the viewport, with accessible close/actions; Settings is capped at 80% viewport height with its footer visible.
- No JavaScript errors were reported during the inspected interactions.

## Remaining manual browser checks

The browser tool accepts HTTP(S) pages but blocks `file:` URLs. The artifact is self-contained, but direct disk opening was not exercised through that tool. Open the HTML in a regular browser to confirm local-file behavior in the target environment.

Print/PDF uses the browser's print function and includes dedicated print styles, expanded epic groups, reporting context, and textual dependency lists. Delivery and Executive roadmaps have a flowing milestone register for print instead of the interactive graph. The embedded preview did not expose a print dialog, so actual print pagination and PDF output across the three views remain manual checks. No PDF export is claimed as verified.

Broader browser compatibility and screen-reader testing remain future checks. The current tests exercise the Python engine and a Chromium-based embedded preview.
