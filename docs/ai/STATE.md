# Project State

Current status as of 2026-05-28.

## Current Focus
No active work in progress. Six issues (#120, #126, #127, #125, #121, #122) completed this session.

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

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
Check for new issues or feature requests.
