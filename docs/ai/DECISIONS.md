# DECISIONS

## Deno-First Execution

- The project uses Deno tasks and Deno runtime APIs as the primary execution model.
- Even when npm packages are imported, they are resolved through Deno's package support, not a Node package install workflow.

## Layered Web App

- The application is organized as middleware -> routes -> service -> repo -> database to separate HTTP concerns, business logic, and persistence.
- `main.ts` mounts routers and middleware, while `service/service.ts` and `repo/repo.ts` act as aggregators.

## Server-Rendered UI

- The frontend is intentionally server-rendered with Handlebars templates and Bootstrap, with HTMX-style partial responses for lighter interactions.
- This keeps the exam workflow simple, fast to load, and easy to operate in constrained environments.

## Manual Theme Deployment

- Uploadthing uses a fixed theme infrastructure derived from `color-tool`, but deployed as static assets inside `uploadthing/static/`.
- `/static/bootstrap.css` must be the full Bootstrap 5.3.8 stylesheet, not just a generated palette-variable file.
- Users can only toggle light versus dark mode for the currently installed theme.
- The active palette is shipped as a generic `/static/theme.css` file that should remain a direct copy of a color-tool theme CSS.
- Theme replacement is an administrator task: replace `/static/theme.css` plus `/static/img/bg-light.jpg` and `/static/img/bg-dark.jpg`, then recommit.
- Uploadthing keeps only one small local shell stylesheet, `/static/ui-shell.css`, on top of the color-tool stack.
- The old multi-file local CSS layer (`base.css`, `theme-bridge.css`, `utilities.css`, `components.css`) is intentionally removed.
- `ui-shell.css` should stay structural and behavioral; palette and contrast decisions should come from Bootstrap variables and the imported color-tool files rather than app-owned color overrides.
- Theme switching is now an admin-side runtime copy operation from `themes/<key>/` into the generic targets under `static/`, rather than a user-facing CSS-file switcher.
- Theme asset URLs are versioned with the runtime `THEME_ASSET_VERSION` value so a just-applied theme invalidates cached `theme.css` and background images on the next full-page render.
- The admin theme selector uses the git-tracked source files in `themes/<key>/` as the source of truth and copies them into the unmanaged generic targets under `static/`.

## Dual API Mounting

- `apiRouter` is mounted at both `/` and `/api`.
- This preserves existing root-level endpoints such as `/activeips` while allowing explicit API-style paths such as `/api/exammode` for new HTMX controls.

## Runtime-Editable Upload Policy

- Allowed upload file types are initialized from env but can be changed by admins while the process is running.
- Upload validation reads the current in-memory config value rather than treating the env-derived startup value as immutable.

## Hybrid Persistence Strategy

- Prisma remains the schema and migration authority, but runtime persistence no longer uses a generated Prisma client.
- Direct SQLite access is still used for `ipfact`, `registrations`, `cookiepresents`, and `abgaben`.
- This hybrid approach is intentional for now and should remain unless there is a deliberate migration plan.
- `users` repository operations are now SQL-backed as well, so runtime CRUD for `users` lives in `repo/users.ts` while Prisma stays responsible for schema state and migrations.
- The long-term direction discussed in this cycle is a future move toward Drizzle, so current reporting-path optimizations should prefer SQL/query shapes that are easy to carry forward.

## Admin Forensics Query Strategy

- The admin forensics page was changed from per-IP N+1 reads to range-level table reads aggregated in memory in `service/ipadmin.ts`.
- Composite indexes were added for the reporting hot path: `cookiepresents(ip, at)`, `registrations(ip, at)`, `abgaben(ip, at)`, and `ipfact(seen, ip)`.
- After validating actual query plans, redundant single-column indexes `cookiepresents(ip)`, `registrations(ip)`, `ipfact(ip)`, and `ipfact(seen)` were removed through the Prisma migration workflow.
- Query-shape tuning for the range aggregation now prefers reducing SQL-side global sorting and performing final per-IP ordering in application code when that avoids temp b-tree work without changing behavior.

## Exam-Oriented Authentication

- The app does not use a conventional username/password flow for students.
- Authentication is a hybrid of operational verification and a signed session cookie.
- The session cookie stores minimal data and is re-hydrated into a user record on each request.

## Cookie Presence Versus Explicit Registration

- Explicit registration events and ongoing cookie-based presence are distinct concepts.
- `registrations` records deliberate registration actions.
- `cookiepresents` records each request that arrives with a valid cookie and resolved user.
- The admin forensics view treats cookie presence as the current user attribution for an IP while still showing explicit registration history separately.
- The student/admin overview IP set is derived from the union of `ipfact`, `cookiepresents`, `registrations`, and submissions so cookie-only IPs are not dropped from the report.
- The overview's displayed report count now combines in-range `ipfact` hits with in-range `cookiepresents` hits, while the detailed IP history list remains an `ipfact`-only breakdown.
- Anomaly detection runs over all aggregated IP entries, not only IPs with current cookie presence, so registration-only multi-IP users still surface as anomalies.

## Socket IP As Ground Truth

- The system treats `c.env.info.remoteAddr` as the authoritative client IP.
- Proxy headers such as `X-Forwarded-For` are intentionally not trusted because auditability matters more than generic proxy compatibility in this environment.

## Local-Time Service, UTC Persistence

- UI and service behavior are expressed in local-time terms for humans.
- Persistence uses UTC timestamps so storage and range queries stay consistent.

## Archival Instead Of Full Deletion For Registrations

- Exam-start operations archive `registrations` into `forensic_registrations` before clearing the active registration table.
- This preserves audit history across exams while resetting the live working set.

## AI Knowledge Persistence

- `AGENTS.md` is the bootstrap document.
- Long-lived agent knowledge belongs in `docs/ai/`.

## Internal Scroll Container for Fixed Navbar

- The main content area (`#app-main`) uses an internal scroll container instead of body scrolling.
- Body has `overflow: hidden` and `height: 100vh`.
- `#app-main` uses `margin-top`, `height: calc(100vh - offset)`, and `overflow-y: auto`.
- Content scrolls within this container and stops at the navbar bottom edge.
- The scrollbar is hidden via CSS (`scrollbar-width: none` + `::-webkit-scrollbar`) while preserving mouse wheel, Page Up/Down, and touch scrolling.
- This prevents content from sliding behind the transparent glassmorphism navbar while keeping the background visible through it.
