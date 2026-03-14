# Project State

Current status as of 2026-03-14.

## Current Focus
UI shell cleanup and user badge layout hardening after recent admin/student forensics fixes.

## Completed (this cycle)
- [x] Kept the user badge initials avatar perfectly circular while preventing the trailing action badge from overflowing the card.
- [x] Simplified `templates/userbadge.hbs` to a flatter flex structure that works on desktop and mobile.
- [x] Changed the user badge action copy to the German label `Ändern`.
- [x] Extracted repeated inline sizing/layout rules from user-facing and admin templates into shared classes in `static/ui-shell.css`.
- [x] Replaced obvious inline layout styles in `templates/admin-report.hbs`, `templates/admin.hbs`, `templates/dirindex.hbs`, `templates/index.hbs`, `templates/admin-filetypes.hbs`, `templates/nav.hbs`, `templates/upload.hbs`, `templates/success.hbs`, `templates/whoami.hbs`, and `templates/admin-exammode.hbs`.
- [x] Validation passed with `deno task check`, `deno task lint`, and `deno task test` after the UI cleanup.
- [x] GitHub issue `#108` was created for the completed user badge and inline-style cleanup work.

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
If more UI cleanup continues, review whether any remaining template-local `<style>` blocks in `templates/index.hbs` should move into `static/ui-shell.css` without making the shell stylesheet harder to navigate.
