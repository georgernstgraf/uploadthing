# Project State

Current status as of 2026-05-28.

## Current Focus
No active work in progress. Issue #120 teacher/student IP split completed.

## Completed (this cycle)
- [x] Admin forensics report now separates teachers from students (#120):
  - Teachers (`klasse === "LehrendeR"`) shown in new "Lehrende IP-Adressen" section
  - Students shown in "Schüler IP-Adressen" section, sorted by lastname→firstname
  - Classification uses the most recent cookie_present user's role
  - Order: students → teachers → unknown IPs
- [x] Added `parseDisplayName()` utility splitting on first blank

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
Check for new issues or feature requests; no follow-up from #120 is required.
