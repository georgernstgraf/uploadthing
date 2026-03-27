# Project State

Current status as of 2026-03-27.

## Current Focus
Feature issue #113 (missed_count for IP cards) is complete. No active work in progress.

## Completed (this cycle)
- [x] Added `getUniqueScanTimestamps()` to `repo/ipfact.ts` for querying unique scan timestamps in a time range.
- [x] Added `missed_count` field to `ServiceIpAdmin` type in `service/ipadmin.ts`.
- [x] Implemented missed_count calculation: counts scans where IP was absent after first appearance in the selected time range.
- [x] Updated badge in `templates/admin-report.hbs` from "Zuletzt: {time}<br>{count}x seit Start" to "Fehlte X-mal".
- [x] Added 6 unit tests for `getUniqueScanTimestamps` in `repo/ipfact_test.ts`.
- [x] Added 4 unit tests for `missed_count` calculation in `service/ipadmin_test.ts`.
- [x] Added testing standards to `AGENTS.md` (Tests Are Mandatory section).
- [x] All 159 tests pass.

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
No immediate tasks. The project is in a stable state. Check for new issues or feature requests.