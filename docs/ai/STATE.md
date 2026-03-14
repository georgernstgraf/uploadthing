# Project State

Current status as of 2026-03-14.

## Current Focus
Bootstrap shell simplification and template ID standardization are complete; the remaining work is wrap-up and any future follow-up polish.

## Completed (this cycle)
- [x] Kept the user badge initials avatar perfectly circular while preventing the trailing action badge from overflowing the card.
- [x] Simplified `templates/userbadge.hbs` to a flatter flex structure that works on desktop and mobile.
- [x] Changed the user badge action copy to the German label `Ändern`.
- [x] Extracted repeated inline sizing/layout rules from user-facing and admin templates into shared classes in `static/ui-shell.css`.
- [x] Increased the documentation link icons in `templates/dirindex.hbs` to `1.5em` and added more spacing between each icon and its label.
- [x] Removed several UI-shell helper classes in favor of native Bootstrap utilities for nav buttons, theme-toggle shell controls, documentation link wrappers, admin report avatar/history-list markup, and one-off width/layout wrappers.
- [x] Replaced the remaining broad shell width/layout helpers with Bootstrap-native container/row/column sizing across the single-card pages and admin pages.
- [x] Redesigned the directory index section around Bootstrap rows and columns and removed the old custom grid helper.
- [x] Added deterministic localhost forensic fixture helpers in `test/helpers/forensics_fixture.ts`.
- [x] Migrated `service/ipadmin_test.ts` and the brittle localhost admin empty-state endpoint test in `test/endpoints_test.ts` to deterministic setup/cleanup.
- [x] Added named forensic scenario helpers for no-anomaly, user-anomaly, and shared-IP-anomaly test cases.
- [x] Added or renamed clear IDs for one-off structural template elements and updated all affected HTMX, CSS, JS, and aria references.
- [x] GitHub issue `#108` tracked the completed user badge and inline-style cleanup work.
- [x] GitHub issue `#109` tracked the completed documentation icon sizing and spacing polish.
- [x] GitHub issue `#110` tracked the completed Bootstrap shell simplification and template ID cleanup work.
- [x] GitHub issue `#111` tracked the completed deterministic localhost forensic fixture work.
- [x] Validation passed with `deno task check`, `deno task lint`, and `deno task test` after the final template ID standardization changes.

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
If more UI cleanup is desired later, keep the remaining custom CSS limited to true shell behavior and Bootstrap gaps rather than reintroducing convenience layout helpers.
