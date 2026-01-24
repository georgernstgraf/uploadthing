# Forensic Page Task Tracker

## Current State (Codebase Reality)

- Forensic page lives at `routes/forensic.ts` and renders `templates/forensic.hbs` via `lib/handlebars.ts`.
- Access is restricted by the `remoteuser` middleware check; unauthorized users get 401.
- Data pipeline: `service.ipfact.ips_with_counts_in_range()` -> `service.user.ofIPs()` + `service.user.get_registered_ips()` -> split into registered vs. unregistered IPs.
- History context is already available: `service.history.ofIP()` and `service.history.ofEmail()` populate per-IP and per-user timelines.
- UI already split into two sections (registered vs. unregistered IPs) and uses `<details>` cards with lightweight history lists.
- Time selection uses start date/time plus optional end date/time with Alpine.js (localStorage preference) and is bounded by a 12-hour display rule.
- Styling is currently implemented with the existing "leisure" card styles, Bootstrap utility classes, and inline styles.
- There is no dedicated forensic API; the page is server-rendered and the route is `/forensic`.

## Open GitHub Issues (Forensic)

- #25 "forensic page: hat abgegeben" <https://github.com/georgernstgraf/uploadthing/issues/25>
- #24 "forensic page: alerts for dropped-out users" <https://github.com/georgernstgraf/uploadthing/issues/24>

## Near-Term Work (Aligned With Current Code)

1. Address issue #25: add a "hat abgegeben" indicator in the forensic results.
   - Likely surfaces in the registered IP cards; needs service/repo support if data not already available.
2. Address issue #24: add alerts for dropped-out users.
   - Likely surfaces in the registered IP cards or as a banner; requires determining how "dropped-out" is represented in user data.
3. Replace `<details>` with Bootstrap accordion or card disclosure if desired, but keep current two-table structure.
4. Optional: add HTMX filtering/refresh for time selection if performance becomes a concern.

## Out of Scope (For Now)

- New auth systems, roles, or APIs.
- Large-scale analytics/ML features, real-time WebSockets, or external caches.
- Major schema changes without a linked issue.
