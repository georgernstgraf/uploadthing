# DECISIONS

## 2026-10-30: Exam-Infrastruktur — API-only, App verlässt die Sense

Ersetzt den früheren Abschnitt „Appliance Structure: current/ + rollout/"
(2026-10-21). Getrackt in Epic #141.

- **Firewall-Steuerung ausschließlich über die OPNsense-API**
  (`POST /api/firewall/filter/toggleRule/{uuid}` + `apply`,
  `GET …/getRule/{uuid}`), Credentials als `OPNSENSE_API_KEY`/`_SECRET` in
  `.env`. Kein `sudo`, kein `exammode.sh`, kein Schreiben in
  `/conf/config.xml`. Die Regel-UUID steht in der Konfiguration, nicht im Code.
- **IP-Präsenz kommt per REST aus dem MikroTik** in den App-Prozess
  (`registration-table`, 60 s). `POST /activeips` und die Scanner-Skripte
  entfallen — der frühere Cronjob auf der Firewall war ein Umweg über
  Loopback-HTTP und Root-Skripte.
- **Die App verlässt die Sense.** Dell = Hypervisor (VirtualBox) + App als
  systemd-Dienst, Sense = Firewall/DNS/DHCP. Damit entfallen `rc.d`,
  `startloop.sh` und der PIDfile-Status-Quirk; die App ist nicht mehr hinter
  der Firewall, sondern ein Peer im Prüfungsnetz.
- **Kein Polling des Firewall-Zustands.** Der Zustand wird beim Rendern des
  Admin-Panels und bei Aktionen gelesen; Drift wird sichtbar gemacht
  („Examen läuft · Internet frei"), aber nicht automatisch geheilt.
- **Exam-Start sperrt implizit** und schreibt `examstate` auch dann, wenn die
  Sperre scheitert — der Schalter zeigt dann den echten Zustand, ein Modal
  nennt den API-Fehler.
- **App-Start bleibt fail-safe:** `examstate` → `stopped`, Internet frei.
  Bewusst akzeptiert: ein Absturz während des Examens öffnet das Netz.
- **`appliance/rollout/` wird nicht gebaut.** Nach dem Cleanup bleiben
  `usbpersist.conf`, `redact-opnsense.sed`, Doku und verschlüsselte
  Config-Backups (gpg/pass, nie Klartext im public Repo).
- **Tik-Zugang:** eigener User mit `read` + `rest-api`, auf die App-IP
  beschränkt. Passwörter nie im Repo — auch nicht in der History.
- **Runtime bleibt Deno, htmx bleibt 2.0.10** bis Februar 2027; die
  Node-Frage wird nach der Saison neu gestellt.

## Single-Repo Exam System (appliance/ Integration)

- The sister repo `examsense` (OPNsense/FreeBSD appliance scripts:
  exammode, scan helpers, rc.d service, redacted config snapshots,
  MikroTik artifacts) was merged into this repository as `appliance/`
  (2026-10-16); `georgernstgraf/examsense` is archived (read-only) on
  GitHub.
- Import method: squashed subtree (`git subtree add --prefix=appliance
  --squash`), deliberately not full-history — the old history stays
  queryable in the archived repo.
- Examsense documentation was consolidated, not duplicated: operational
  guidance lives in `docs/ai/OPERATIONS.md` ("Appliance Setup"), script
  conventions in `docs/ai/CONVENTIONS.md` ("Appliance Scripts");
  `appliance/README.md` and `appliance/AGENTS.md` are thin pointers.
- The examsense Makefile target lives on as `config-snapshot` in the
  root Makefile; it runs **on the appliance** (source is
  `/conf/config.xml`), not on the dev machine.
- `appliance/files/` filenames map 1:1 to OPNsense system paths
  (slashes replaced by underscores); renaming requires a deployment
  migration note.

## Native TLS, No Proxy

- uploadthing is itself the TLS endpoint via `Deno.serve` (`cert`/`key` options); no reverse proxy is put in front.
- TLS is opt-in: `TLS_CERT_PATH` and `TLS_KEY_PATH` must be set together (fail-fast, German error) — unset means plain HTTP, unchanged behavior.
- The certificate source is the Let's Encrypt harvest on the school host `kik` (internal repo KI-Kustodiat-intern issue #3; uploadthing issue #136 is linked as its sub-issue). Certificates are copied manually via `scp`; after each copy the service restarts, since Deno reads cert/key at startup.
- Final topology on `sense` (2026-10-16): Deno listens on **loopback 8000
  only** (`LISTEN_HOST=127.0.0.1`); the OPNsense GUI moved from 443 to
  **8443** with the real Let's Encrypt certificate imported into the
  OPNsense cert store; a DNAT port forward on LAN translates
  `192.168.21.1:443` → `127.0.0.1:8000` (pf rdr with auto-generated
  associated pass rule, **no SNAT**, so client IPs are preserved). Result:
  `https://tst.spengergasse.at` works without a port, TLS stays
  end-to-end in `Deno.serve`, and port 8000 is unreachable from the
  network. Privileged-port workarounds (`mac_portacl`, lowering
  `net.inet.ip.portrange.reservedhigh`) were discarded — the loopback
  binding plus DNAT makes them unnecessary. First upgrade-proof: the
  OPNsense upgrade to 26.7.3_11 (2026-10-20, with reboot) left the DNAT
  rule, GUI port 8443 + imported certificate, and the boot-started
  loopback listener untouched.

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

## Router Split: Machine Contract At Root, API Under /api

- `machineRouter` is mounted at the root and carries only `POST /activeips`, the external contract with the WLAN infrastructure (IP-whitelist via `ACTIVEIPS_ALLOWED_IPS`).
- `apiRouter` is mounted only under `/api`.
- The former dual mounting (`/` and `/api`) was removed; the shadow paths `/exammode` (root) and `/api/activeips` no longer exist.

## Exam Lifecycle State Machine

- Exam duration is preset by the admin: `examstate` is a SQLite singleton (`idle`/`running`/`paused`/`stopped`) with duration, extra seconds, and accumulated pause time; Prisma owns the schema, runtime access is direct SQLite via `repo/exam.ts`.
- `service/exam.ts` is authoritative for remaining time; the clock is injectable for tests. `updated_at` doubles as the pause-start anchor (pause()/resume() only touch it; addExtra during a pause deliberately does not).
- Pause only stops the countdown — uploads and Unterlagen downloads stay allowed. Stop and natural expiry both mean exam mode off with internet released; there is no grace period.
- Startup always resets to exam mode off / internet free and forces a stuck `running`/`paused` examstate to `stopped` — this reverses the earlier "block internet on startup" behavior.
- Uploads (`POST /upload`) and Unterlagen downloads (`GET /unterlagen/*`) are gated by `service.exam.isExamWindowOpen()`; the Unterlagen index (`GET /`) stays public. Admins are not exempted from the Unterlagen gating.
- Early submissions are encouraged; `canResubmit()` already enforces "submitted + left the network = no resubmission, submitted + stayed = resubmission allowed".

## Runtime-Editable Upload Policy

- Allowed upload file types are initialized from env but can be changed by admins while the process is running.
- Upload validation reads the current in-memory config value rather than treating the env-derived startup value as immutable.

## Hybrid Persistence Strategy

- Prisma remains the schema and migration authority, but runtime persistence no longer uses a generated Prisma client.
- Direct SQLite access is still used for `ipfact`, `registrations`, `cookiepresents`, `abgaben`, `examstate`, and `users`.
- Historical origin: the raw-SQL runtime layer exists because the Prisma engines were a major pain on FreeBSD/OPNsense (Linuxulator) — it is a pragmatic workaround that hardened into the current architecture, not a design preference. The planned Drizzle migration (#133) resolves the underlying engine problem and thereby makes the workaround itself obsolete.
- This hybrid approach is intentional for now and should remain unless there is a deliberate migration plan.
- `users` repository operations are now SQL-backed as well, so runtime CRUD for `users` lives in `repo/users.ts` while Prisma stays responsible for schema state and migrations.
- The long-term direction discussed in this cycle is a future move toward Drizzle, so current reporting-path optimizations should prefer SQL/query shapes that are easy to carry forward.
- The Drizzle motivation is sharpened by the deployment reality (#133): Prisma engines are Linux binaries that only run on the OPNsense production host through the FreeBSD Linuxulator, which forces a hard pin on Prisma 6. Drizzle is engine-free pure TS and removes engines, the Linuxulator dependency, and the version pin in one move.
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
