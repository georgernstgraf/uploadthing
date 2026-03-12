# Project State

Current status as of 2026-03-12.

## Current Focus
Admin/student forensics UI polish, HTMX stability, and admin maintenance controls.

## Completed (this cycle)
- [x] Known-IP cards now combine "Zuletzt" and the in-range hit count into one header badge in `templates/admin-report.hbs`.
- [x] Stale known-IP cards now render that header badge as a danger badge instead of using a success border highlight in `templates/admin-report.hbs`.
- [x] Submission presence on known-IP cards now appears as a separate success badge with a tooltip built from `submissionTooltip` in `lib/handlebars.ts`.
- [x] Admin IP timestamps now use `localAdminIpString` with a fixed 15-hour cutoff in `lib/timefunc.ts`, and the admin IP services consume that formatter.
- [x] Known-IP card counts now use the selected time range (`seen_at_desc.length`) rather than an all-time total for the IP in `templates/admin-report.hbs`.
- [x] `uploadthing.db` was checked directly and confirms that IP `192.168.21.80` has `3772` `ipfact` rows since `2026-03-01T00:00:00.000Z`, with first sighting `2026-03-04T11:37:02.895Z` and last sighting `2026-03-09T06:26:03.016Z`.
- [x] The Admin subpage now treats theme, firewall, submission directory, and filetype management as equal vertical sections in `templates/admin-filetypes.hbs`.
- [x] A global Bootstrap-based HTMX loading spinner now appears during active HTMX requests via `templates/main.hbs` and `templates/index.hbs`.
- [x] The admin forensics page now shows anomaly detection between the time selector and known IPs, with IP-based and user-based anomaly views derived from combined cookie and registration activity in `service/ipadmin.ts` and `templates/admin.hbs`.
- [x] The anomaly UI now uses German-only text and collapses into a warning-styled Bootstrap accordion when findings exist; otherwise it shows `Es gibt keine Anomalien.`.
- [x] Admin refresh suppression and the global HTMX spinner now stay in sync even when auto-refresh is canceled because anomaly details or IP cards are open.
- [x] The Admin page now offers `Datenbank bereinigen`, which removes rows older than one month from `cookiepresents`, `registrations`, `ipfact`, and `abgaben` and reports the deletion counts back in the UI.
- [x] Validation passed with `deno task check`, `deno task lint`, and `deno task test`.

## Pending
- [ ] None.

## Blockers
None.

## Next Session Suggestion
If admin forensics work continues, start with browser verification of the known-IP badges and tooltip behavior against realistic `/admin` data.
