# PITFALLS

## Fail-Strict Configuration

- Config is fail-fast: all required env vars are validated at module load time via `requireEnv()` and `parseRequiredIpList()`.
- Do not add new optional env vars with silent fallbacks for security-relevant or operation-critical settings; use `requireEnv()` instead.
- The `!` non-null assertion pattern is no longer sufficient; use `requireEnv()` so the error message describes which variable is missing.
- If `deno task start` fails immediately with a German error message, check that all required env vars in `lib/config.ts` are present in the environment.

## Outdated Testing References

- Ignore old guidance that mentions `deno task testdb` or `main_test_db.ts`; they are not part of the current workflow.
- `main_test.ts` is only a placeholder and not the active test harness.
- The required validation commands are `deno task check`, `deno task lint`, and `deno task test`.

## IP Trust Assumptions

- Do not introduce logic that trusts `X-Forwarded-For` or similar headers without an explicit architectural change.
- The admin and audit model depends on the socket IP from `c.env.info.remoteAddr`.

## Admin Role Assumptions

- Admin access is currently inferred from `remoteuser?.klasse === "LehrendeR"`.
- Teacher registration may also be restricted by `ADMIN_IPS`.
- Do not assume there is a separate role table or permission framework.

## Persistence Gotchas

- Persistence is hybrid: not everything goes through Prisma.
- Repositories using direct SQLite prepared statements expect UTC ISO timestamps.
- Be careful not to document the app as Prisma-only.
- Do not reintroduce runtime Prisma client usage for `users`; Prisma stays in the project for schema and migrations, while runtime user CRUD is handled in `repo/users.ts`.
- Do not hand-edit index/drop-index migration SQL when the change belongs in Prisma schema state; remove or add indexes in `prisma/schema.prisma` first and generate the migration with `deno task pmd --name <migration_name>`.
- If `deno task pmd` appears to pause, check the CLI invocation carefully: Prisma wants `--name <migration_name>` passed through the Deno task, and a malformed argument shape can fall back to an interactive migration-name prompt.
- Prisma SQLite URLs such as `file:../uploadthing.db` are relative to the `prisma/` directory; if raw SQLite code resolves them relative to another directory, it can open the wrong database and surface missing-table errors like `no such table: ipfact`.

## Upload Safety

- Uploaded filenames must go through `safeFileComponent` and versioned path handling.
- Do not add raw path joins or trust user-provided filenames.
- Upload behavior is constrained by `MAX_UPLOAD_MB`, `PERMITTED_FILETYPES`, and filesystem directories from env.
- `PERMITTED_FILETYPES` starts from env but can be changed at runtime by admins, so do not assume it is immutable after process start.

## Test Suite Sharp Edges

- `deno task test` starts the app through `scripts/test-with-server.sh` and then runs `deno test -A --env-file`.
- The repository root `vacuum.db` is intended to remain a clean slate; never write into it directly.
- When a writable test or local database is needed, copy `vacuum.db` to the path referenced by `DATABASE_URL` instead.
- Some endpoint tests and JSON fixtures still reference routes or behaviors that are stale, permissive, or destructive, such as `/admin/logs` and `/admin/wipe-abgaben`.
- Read tests before changing behavior and do not assume they perfectly describe the current product surface.
- If shutdown handling changes, remember that closing Prisma and SQLite alone is not enough; the `Deno.serve` server must also be stopped or the process will keep running after SIGINT.
- Local developer activity mutates `uploadthing.db`, so forensic endpoint tests that depend on localhost state become flaky unless they explicitly clear and reseed `127.0.0.1` through shared fixtures first.

## External Dependency Risks

- LDAP access can be slow or unavailable; the code includes reconnect logic and retry timing.
- Do not start LDAP connections at module import time; eager startup causes unrelated tests to leak timers, reads, and TLS handshakes.
- `POST /api/exammode` depends on a system `exammode` command in `PATH`; non-zero exits should surface as toast-visible HTMX errors and must not silently flip the UI state.
- Successful `exammode` runs currently return a short stdout message (`internet enabled` or `internet disabled`) and exit `0`.
- The firewall toggle does not auto-discover the machine's real internet state; it starts from env/config and only changes after successful admin-triggered `exammode` runs.
- The current dev machine ships a stub `exammode` in `PATH` that only echoes the success text, so local endpoint tests verify UI/backend wiring rather than a real firewall change.
- Browser-visible flows may also depend on local directories such as `ABGABEN_DIR` and `UNTERLAGEN_DIR` existing and being readable.

## Cookie Presence Semantics

- Do not treat a valid session cookie hit as a new `registrations` event.
- Current attribution for the admin forensics page comes from `cookiepresents`, while `registrations` remains a history of explicit registration actions.
- Runtime code should no longer depend on `forensic_registrations`; the current schema uses `cookiepresents` instead.
- Do not show known-IP card counts from total `ipfact` rows for an IP; the card count must come from the selected time window, currently `seen_at_desc.length`.
- Admin forensics timestamps on the IP cards use a fixed 15-hour cutoff via `localAdminIpString`, not the generic `TODAY_HOURS_CUTOFF` value.
- The admin anomaly panel belongs between the time selector and the known-IP report; if anomalies exist it should default to a collapsed Bootstrap accordion with warning styling in the header, and if none exist it should render the German-only empty state `Es gibt keine Anomalien.`.
- The Admin page now includes a database cleanup control that deletes rows older than one month from `cookiepresents`, `registrations`, `ipfact`, and `abgaben`; it is intentionally fixed-duration and not runtime-configurable.
- The anomaly panel must not be gated only by `anomalies.by_ip.length`; user-only anomalies are valid and the UI should treat `anomalies.by_user.length` as sufficient to render the panel.
- Registration-only multi-IP anomalies are expected on `/admin/students`; do not restrict anomaly detection to IPs that also have cookie presence in the selected range.
- The deterministic localhost forensic fixture helpers now live in `test/helpers/forensics_fixture.ts`; prefer named scenario setup there over ad-hoc SQL cleanup embedded directly in each test.
- HTMX network failures such as connection refused, DNS errors, and timeouts surface through `htmx:sendError` / `htmx:timeout`, not `htmx:responseError`, so toast handling in `templates/index.hbs` must listen to both paths.
- When using `gh issue comment` or `gh issue close --comment` from the shell, use a heredoc or `--body-file`/careful quoting; unescaped backticks in inline shell strings trigger command substitution and produce noisy but harmless shell errors.
- When validating admin forensics performance work, run `EXPLAIN QUERY PLAN` against the real local `uploadthing.db`, not only against assumptions from the schema. The useful verification commands in this cycle checked these exact query families: `SELECT DISTINCT ip FROM ipfact WHERE seen BETWEEN ...`, `SELECT seen FROM ipfact WHERE ip = ? AND seen BETWEEN ... ORDER BY seen DESC`, latest-by-IP lookups for `cookiepresents` and `registrations`, latest-by-user lookup for `registrations`, user/range queries for `abgaben`, and the range aggregation reads introduced for `service/ipadmin.ts`.
- The range-based admin aggregation originally used `ORDER BY ip ASC, at/seen DESC`, but `EXPLAIN QUERY PLAN` showed temp b-tree sorting on those shapes; the final implementation removes unnecessary global ordering from `cookiepresents`, `registrations`, and `abgaben` range reads, changes `ipfact` range reads to `ORDER BY seen DESC`, and sorts each per-IP bucket in memory inside `service/ipadmin.ts`.

## Theme Asset Workflow

- Do not edit `/static/theme.css` when switching visual themes; it is meant to stay a direct copy from `color-tool`.
- Do not use the old generated variable-only `static/bootstrap.css`; uploadthing needs the full Bootstrap stylesheet or the Bootstrap component classes render almost unstyled.
- Uploadthing-specific adaptation belongs in `/static/ui-shell.css`.
- The installed theme background images must use the generic filenames `/static/img/bg-light.jpg` and `/static/img/bg-dark.jpg`.
- The light/dark toggle must not swap CSS files at runtime; only the background image and `data-bs-theme` mode should change.
- The admin theme selector must do a normal full-page POST/response cycle, not an HTMX partial swap, because applying a new theme needs the page head to re-render with the new asset-version query string.
- Only offer theme directories that contain all three required files: `theme.css`, `bg-light.jpg`, and `bg-dark.jpg`.
- Do not reintroduce the old local CSS stack unless there is a deliberate architectural reason; the goal is to stay close to Bootstrap plus the color-tool files.
- Avoid defining app-owned palette variables in `/static/ui-shell.css`; use Bootstrap/color-tool variables directly so the imported theme continues to control color and contrast.
- Bootstrap-aware theming depends on Bootstrap-aware markup; generic glass wrappers alone do not pick up the intended component styling from `bootstrap-overrides.css`.

## Bootstrap Utility Specificity

- Bootstrap 5 utility classes like `p-2`, `m-3`, etc. use `!important`, so they silently override any custom CSS rule targeting the same property on the same element.
- Do not combine Bootstrap shorthand padding/margin utilities with axis-specific custom properties on `#main-wrapper` or similar layout elements; prefer axis-specific utilities (`px-2 pb-2`) and let `ui-shell.css` own the remaining axis.
- When debugging unexpected spacing, check for Bootstrap utility `!important` overrides first.
- Flex rows with fixed-size avatar/badge elements need an explicit flexible text region or content-driven card width; otherwise non-shrinking items can push trailing badges outside the card.
- Renaming template IDs is easy to miss because HTMX targets/includes, JS selectors in `templates/index.hbs`, and shell CSS selectors can all depend on them; always grep for `#old-id` before changing a one-off element ID.

## Generated Artifacts

- `lib/prismaclient/` is no longer used by runtime code after the user-repository refactor; do not reintroduce it unless the project deliberately returns to generated Prisma client usage.
- Do not reintroduce legacy agent scaffold artifacts such as `.openclaw/`, `memory/`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `HEARTBEAT.md`, or `TOOLS.md`; durable project knowledge belongs in `docs/ai/` instead.

## Download Filename Truncation

- In `routes/admin.ts:234`, the download-abgaben timestamp uses `.slice(0, 15)` which truncates the minutes to one digit. The correct slice is `.slice(0, 16)` to capture the full `HH-MM` portion (e.g., `2026-04-29_09-37` instead of `2026-04-29_09-3`).

## Test Isolation Pitfall

- The test suite runs against the real `uploadthing.db`, not an isolated test database.
- If a developer is logged in locally (e.g., via `localhost:8000`), their session data and registrations remain in the database and can cause flaky test failures, especially for anomaly detection tests.
- When running `deno task test`, ensure you have no active local sessions or registrations that could interfere with test assertions.
- The test user "grafg@spengergasse.at" is hardcoded in endpoint tests; do not use this email for local development sessions.

## HTMX Attribute Inheritance Traps

- `hx-select` inherits from parent elements down to children. A child's HTMX request will filter its response through a parent's `hx-select`, even if the selector is meaningless for the child's endpoint. This caused the IP detail modal to be empty because `hx-select="#admin-report-panel > *"` on the section filtered the `/admin/ip-detail` response to nothing.
- `hx-disinherit` must be placed on an ANCESTOR of the elements that should not inherit, not on the elements themselves. HTMX's `getAttributeValueWithDisinheritance` has a guard `initialElement !== ancestor` that skips the disinherit check on the starting element. Placing `hx-disinherit` on the card itself is silently ignored; place it on the parent `<div.row>` or `<div.col>` wrapper instead.
- `hx-on:` with camelCase event names (e.g., `hx-on::afterSwap`) breaks because HTML attribute names are case-insensitive and get lowercased by the browser to `hx-on::afterswap`. HTMX tries to match against the dispatched event (`htmx:afterSwap`) and fails. Always use kebab-case event names: `hx-on:htmx:after-swap`.
- `htmx:afterSwap` fires on the swap TARGET elements (the content being swapped in), NOT on the requesting element. The event bubbles up from the target, so a listener on the card element (which is not an ancestor of the target) will never receive it. For per-request handling, use `htmx:afterRequest` (fires on the requesting element) or listen on `document` with a target-ID check.

## Bootstrap JS Missing

- The project had `bootstrap.css` (CSS only) but never loaded Bootstrap's JavaScript. `bootstrap.Modal`, `bootstrap.Tooltip`, etc. were all `undefined`. Bootstrap modals, tooltips, and `data-bs-*` dismiss attributes require loading `bootstrap.bundle.js`.
- All external libraries in `static/` must be non-minified for auditability and debugging. Use symlinks from the generic name to the versioned name (e.g., `htmx.js` → `htmx-2.0.10.js`).

## Missed Count After Submission

- The `missed_count` calculation in `service/ipadmin.ts` previously counted ongoing absence after the last scan, even if the student had already submitted their work and left. A student who leaves after submitting should not be penalized; scans after their most recent submission are excluded from `missed_count`.
