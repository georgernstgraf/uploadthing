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
- Runtime SQLite path resolution now derives from Prisma's `DATABASE_URL`, and only Prisma-style SQLite `file:` URLs are supported for raw SQL access.

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

## Teacher/Student Split in Admin Forensics View

- The admin forensics report now splits IP cards by role: students and teachers each get their own section.
- Classification is determined by the most recent `cookie_presents[0]` user: `klasse === "LehrendeR"` → teacher section, otherwise → student section.
- IPs without cookies remain in the "Unbekannte IP-Adressen" section unchanged.
- Student and teacher sections are both sorted by (lastname, firstname), parsed from the display name by splitting on the first blank.
- This avoids mixed-context IP cards and makes the teacher audit trail more discoverable.

## Fail-Strict Configuration

- All security-relevant and operation-critical configuration is now required at startup.
- `requireEnv()` throws immediately at module load time with a German error message if a required env var is missing, instead of silently falling back to a default.
- `parseRequiredIpList()` enforces that IP whitelists (`ADMIN_IPS`, `ACTIVEIPS_ALLOWED_IPS`) are explicitly configured.
- The following variables were changed from optional/fallback to required: `ABGABEN_DIR`, `UNTERLAGEN_DIR`, `LISTEN_PORT`, `COOKIE_SECRET`, `ADMIN_IPS`, `ACTIVEIPS_ALLOWED_IPS`, `SERVICE_DN`, `SERVICE_PW`, `SERVICE_URL`, `SEARCH_BASE`.

## IP Whitelist for POST /activeips

- The `/activeips` endpoint is now protected by an IP whitelist via `ACTIVEIPS_ALLOWED_IPS`.
- Only requests from whitelisted source IPs can report active IPs.
- The whitelist is independent from `ADMIN_IPS` since the WLAN device and admin machines may be on different IPs.

## Internal Scroll Container for Fixed Navbar

- The main content area (`#app-main`) uses an internal scroll container instead of body scrolling.
- Body has `overflow: hidden` and `height: 100vh`.
- `#app-main` uses `margin-top`, `height: calc(100vh - offset)`, and `overflow-y: auto`.
- Content scrolls within this container and stops at the navbar bottom edge.
- The scrollbar is hidden via CSS (`scrollbar-width: none` + `::-webkit-scrollbar`) while preserving mouse wheel, Page Up/Down, and touch scrolling.
- This prevents content from sliding behind the transparent glassmorphism navbar while keeping the background visible through it.

## 2026-06-09: Missed count stops after last submission

- **Choice**: IP detail modal content swap into `#ip-detail-modal-content` via `hx-target` with `hx-disinherit="hx-select"` on row wrappers to block inherited `hx-select` from the panel section.

- **Choice**: Modal show triggered via global `htmx:afterSwap` listener in `templates/index.hbs`, checking `evt.detail.target.id === 'ip-detail-modal-content'`. Per-card `hx-on` handlers removed.

- **Choice**: All external JS/CSS libraries stored as non-minified development source files with versioned filenames and symlinks (e.g., `htmx.js` → `htmx-2.0.10.js`). This enables source inspection and makes upgrades explicit.

- **Choice**: `bootstrap.bundle.js` loaded in `<head>` (after `htmx.js`, before `toast.js`) to enable Bootstrap modal API. Previously only `bootstrap.css` was loaded, leaving `bootstrap.Modal` undefined.

## 2026-06-09: IP presence timeline with absent highlighting

- **Choice**: `ServiceIPDetail.seen_at_desc` changed from `string[]` to `{ at: string; present: boolean }[]`. The `getIPDetail()` service generates a continuous minute-by-minute timeline from the IP's first-seen to last-seen within the query range.

- **Choice**: Absent minutes rendered with `list-group-item-danger` (red-tinted background) and a "fehlt" (absent) label. Present minutes have no special styling.

- **Choice**: `seen_count` set to `seenRows.length` (actual sightings), not the timeline length.

## 2026-06-09: Cookie deduplication in IP detail modal

- **Choice**: Cookie entries grouped by minute with a count accumulator. `count_gt_1` boolean avoids showing `(&times;1)` — multiplier only appears when duplicates exist. Applied only in `getIPDetail()`, not in `for_range()`.

## 2026-06-09: Database cleanup cutoff to 1 year

- **Choice**: `cleanupDatabaseOlderThanOneMonth` renamed to `cleanupDatabaseOlderThanOneYear`, cutoff changed from `setMonth(-1)` to `setFullYear(-1)`. Affects all 4 tables uniformly.

## 2026-06-09: IP detail modal 2-column layout

- **Choice**: Modal restructured: left column stacks Abgaben → Registrierungen → Cookies (each max 35vh), right column holds IP-Präsenz with `flex-grow-1` and `max-height: 80vh`. Content-driven sizing, no forced `min-height`.
