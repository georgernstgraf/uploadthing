# Project State

Current status as of 2026-05-28.

## Current Focus
No active work in progress. Seven issues (#120, #126, #127, #125, #121, #122, #123) completed this session.

## Completed (this cycle)
- [x] Admin forensics report separates teachers from students (#120):
  - Teachers shown in new "Lehrende IP-Adressen" section
  - Student/teacher classification by most recent cookie role, sorted by name
- [x] Added `parseDisplayName()` splitting on first blank
- [x] Resubmission blocked when student drops out of WLAN (#126):
  - `canResubmit()` checks IP presence in all scans since last submission
  - Error surfaces via HTMX toast
- [x] Config made fail-strict, `/activeips` IP-whitelisted (#127):
  - `requireEnv()` + `parseRequiredIpList()` helpers
  - 10 fields changed from optional to required
  - `ACTIVEIPS_ALLOWED_IPS` whitelist for POST /activeips
  - Configuration documented in README.md
- [x] Nav button "START" renamed to "ANGABE + DOKU" (#125):
  - Changed label in `templates/nav.hbs:6`
- [x] Unified exammode.sh with start/stop/status in examsense repo (#121):
  - `bin/exammode.sh` — start (block), stop (allow), status ("on"/"off")
  - Replaces enable_doku_rule.sh / disable_doku_rule.sh
- [x] Uploadthing exammode overhaul with startup activation (#122):
  - `getExamModeCommandArg()` → `"start"`/`"stop"`
  - New `getExamModeStatus()` for GET /api/exammode
  - Blocking `runExamModeOnStartup()` before serve()
  - Tests updated, 175 pass
- [x] IP detail modal replaces details/summary cards in admin report (#123):
  - Modal-xl via HTMX hx-get on card click
  - New `GET /admin/ip-detail` endpoint + `getIPDetail()` service
  - Massive Payload-Reduktion im Admin-Report (nur noch Summary-Daten)
  - 35vh Scroll-Listen, Bootstrap-Modal außerhalb Refresh-Panel

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
Check for new issues or feature requests.
