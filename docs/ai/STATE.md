# Project State

Current status as of 2026-03-14.

## Current Focus
Small UI polish in the documentation link card after the larger user badge and shell CSS cleanup.

## Completed (this cycle)
- [x] Kept the user badge initials avatar perfectly circular while preventing the trailing action badge from overflowing the card.
- [x] Simplified `templates/userbadge.hbs` to a flatter flex structure that works on desktop and mobile.
- [x] Changed the user badge action copy to the German label `Ändern`.
- [x] Extracted repeated inline sizing/layout rules from user-facing and admin templates into shared classes in `static/ui-shell.css`.
- [x] Replaced obvious inline layout styles in `templates/admin-report.hbs`, `templates/admin.hbs`, `templates/dirindex.hbs`, `templates/index.hbs`, `templates/admin-filetypes.hbs`, `templates/nav.hbs`, `templates/upload.hbs`, `templates/success.hbs`, `templates/whoami.hbs`, and `templates/admin-exammode.hbs`.
- [x] Validation passed with `deno task check`, `deno task lint`, and `deno task test` after the UI cleanup.
- [x] GitHub issue `#108` was created for the completed user badge and inline-style cleanup work.
- [x] Increased the documentation link icons in `templates/dirindex.hbs` to `1.5em` and added more spacing between each icon and its label via shared classes in `static/ui-shell.css`.
- [x] GitHub issue `#109` was created for the documentation icon sizing and spacing polish.

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
If more UI polish continues, review whether the documentation buttons should also get a slightly taller vertical rhythm now that the icons scale relative to the label text.
