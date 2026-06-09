# Project State

Current status as of 2026-06-09.

## Current Focus
Issue #128 — IP detail modal not appearing; missed count badge overcounting.

## Completed (this cycle)
- [x] Fixed IP detail modal — 3 separate root causes (#128):
  - Missing `bootstrap.bundle.js` (only CSS was loaded, `bootstrap.Modal` was undefined)
  - `hx-disinherit="hx-select"` placed on card itself was silently ignored; moved to parent `div.row` wrappers to block inherited `hx-select` from filtering responses
  - Modal show triggered via global `htmx:afterSwap` document listener checking target ID, instead of broken per-card `hx-on`
- [x] Fixed missed_count to stop after most recent submission:
  - `service/ipadmin.ts`: `for_range()` now uses the most recent submission as a cutoff; scans after submission are excluded from `missed_count`
  - `service/ipadmin_test.ts`: new test `missed_count stops after most recent submission`
- [x] Upgraded external libraries to latest stable, all non-minified:
  - htmx: 2.0.8 → 2.0.10
  - alpine: 3.14.1 (minified) → 3.15.12 (non-minified)
  - bootstrap: 5.3.8 (was already latest CSS-only, added `bootstrap.bundle.js`)
- [x] Versioned filenames with symlinks in `static/`:
  - `htmx.js` → `htmx-2.0.10.js`, `alpine.js` → `alpine-3.15.12.js`
  - `bootstrap.css` → `bootstrap-5.3.8.css`, `bootstrap.bundle.js` → `bootstrap-5.3.8.bundle.js`

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
Verify modal works end-to-end in the browser. If the modal is nested too deeply in `#app-content`, consider moving it to `templates/main.hbs` as a direct sibling of `#app-content` to avoid stacking context issues with the Bootstrap backdrop.
