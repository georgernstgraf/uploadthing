# Project State

Current status as of 2026-03-14.

## Current Focus
Admin/student forensics correctness fixes around route naming, HTMX error reporting, combined report counts, and anomaly detection coverage.

## Completed (this cycle)
- [x] Student/IP forensics moved to `/admin/students`, and the runtime admin settings page moved from `/admin/filetypes` to `/admin/application`.
- [x] Navbar links, HTMX form targets, and endpoint tests were updated to use the new `/admin/students` and `/admin/application` paths.
- [x] The shared HTMX shell in `templates/index.hbs` now shows a danger toast for `htmx:sendError` and `htmx:timeout`, so unreachable-backend failures surface to the UI in addition to normal HTTP `htmx:responseError` cases.
- [x] The admin/student IP overview now includes cookie-only IPs by aggregating the union of `ipfact`, `cookiepresents`, `registrations`, and submissions in `service/ipadmin.ts`.
- [x] The student overview badge count now uses a combined `report_count` (`ipfact` hits + cookie presence hits) while the detailed IP history section remains explicitly labeled as `IP-Fact` only.
- [x] Anomaly detection now runs across all aggregated IP entries, including registration-only IPs without cookie presence, so multi-IP users are still flagged.
- [x] The anomaly accordion on `templates/admin.hbs` now renders whenever user anomalies exist, not only when IP anomalies exist.
- [x] Added regression coverage for cookie-only known IPs, registration-only user anomalies, and rendered `/admin/students` user-anomaly visibility in `service/ipadmin_test.ts` and `test/endpoints_test.ts`.
- [x] GitHub issue `#106` was created, commented, committed, pushed, and closed for the cookie-presence IP inclusion work.
- [x] GitHub issue `#104` was reused, commented, committed, pushed, and closed for the network-error toast fix.
- [x] Validation passed with `deno task check`, `deno task lint`, and `deno task test` after each completed change set in this session.

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
If more admin forensics work continues, review whether the known/unknown split and anomaly model should also incorporate submissions or other signals beyond cookie presence and explicit registrations.
