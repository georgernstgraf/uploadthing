# STATE

## Current Entry Points

- `main.ts` starts the Hono app with `Deno.serve`.
- `main.ts` owns centralized SIGINT/SIGTERM shutdown, aborts the HTTP server via `AbortController`, then closes Prisma and SQLite.
- Middleware order is `sessionMiddleware` first, then `remoteIPMiddleware`.
- Routers are mounted for admin, upload, auth, API, home, and static/file serving.
- `apiRouter` is mounted at both `/` and `/api`; the firewall toggle uses `/api/exammode`.

## Route Inventory

- `routes/home.ts`: renders the main page and available `unterlagen` files.
- `routes/auth.ts`: `GET /whoami`, `GET /ldap`, `POST /register`.
- `routes/upload.ts`: authenticated upload form and submission handling.
- `routes/api.ts`: `POST /activeips` for IP activity ingestion and `POST /exammode` for admin-only internet/firewall toggling.
- `routes/admin.ts`: admin overview, runtime file type settings for teachers, download of submissions plus DB backup, and a wipe action for the submissions directory.
- `routes/files.ts`: serves `static/` and authenticated `unterlagen/` files.
- Admin navigation now shows two teacher-only entries: `Schüler` for the IP-forensics/admin overview and `Dateitypen` for runtime upload policy settings plus maintenance actions.
- The `Dateitypen` page includes a centered Bootstrap `form-switch` that HTMX-posts to `/api/exammode` and swaps itself with the updated fragment.
- The `Schüler` page no longer contains the download and wipe controls; those maintenance actions now live on `Dateitypen` alongside file-type management.
- `templates/index.hbs` now loads the color-tool-style theme stack in this order: `bootstrap.css`, `ui-config.css`, `theme.css`, `bootstrap-overrides.css`, then one small local layer: `app.css`.
- Theme mode is persisted in `localStorage` under `uploadthing-mode`; default is light if nothing is stored.
- Light/dark switching no longer swaps theme CSS files; it keeps `/static/theme.css` loaded and only changes `data-bs-theme` plus the body background image.
- `static/app.css` is now limited to global glue only: the fixed background-image layer, the app font family, and `details > summary` marker cleanup.
- Major Handlebars views now use Bootstrap component semantics directly (`card-header`, `card-body`, `card-footer`, `list-group`, `badge`, Bootstrap buttons) so the imported color-tool overrides apply through native Bootstrap classes.

## Service And Repo Layout

- `service/service.ts` re-exports `ipfact`, `ldap`, `registrations`, `user`, `abgaben`, `ipadmin`, and `admin` services.
- `repo/repo.ts` re-exports Prisma access, SQLite access, and repository modules.
- `repo/prismadb.ts` owns Prisma lifecycle.
- `repo/db.ts` owns the shared SQLite connection and WAL mode.
- `repo/ldapuser.ts` now creates the LDAP client lazily on first real LDAP access instead of at import time.

## Data Model

- Prisma schema lives in `prisma/schema.prisma`.
- Tables/models in active use: `users`, `ipfact`, `registrations`, `cookiepresents`, `abgaben`.
- `users` is accessed through Prisma.
- The remaining operational tables use direct SQLite queries.

## Sessions And Auth State

- Session cookies contain `{ email, createdAt }`, encoded and HMAC-signed.
- Request state in Hono context includes `remoteip`, `remoteuser`, `session`, and `is_admin`.
- On each request, the session email is resolved back to a user record and a cookie-presence event is recorded for the current IP.

## Current Commands

```bash
deno task dev
deno task start
deno task stop
deno task check
deno task lint
deno task test
deno task fullcheck
deno task pg
deno task pv
deno task pmD
deno task pmd
deno task pms
deno task pmr
deno task ps
```

## Current Testing Setup

- `deno task test` runs `scripts/test-with-server.sh`.
- That script sources `.env`, starts the server with `deno task start`, then runs `deno test -A --env-file`.
- Active tests exist under `test/`, `middleware/`, and `lib/`.
- `test/endpoints_test.ts` exercises live HTTP behavior against the running server.
- Teachers can change `PERMITTED_FILETYPES` at runtime through the admin UI; upload validation reads the current in-memory config value on each request.
- The `Dateitypen` page also contains the documentation-server firewall toggle; successful toggles update in-memory internet state after `exammode on|off` completes.
- The current `exammode` success contract is simple: print `internet enabled` or `internet disabled` and exit with status `0`.
- Internet state is initialized from env at process start and then tracked in memory for the rest of the runtime.
- `templates/index.hbs` now shows toasts for HTMX error responses with any status >= 400, which is how `exammode` execution failures reach admins.
- The admin forensics page now classifies known versus unknown IPs from `cookiepresents`, not from `registrations`.
- Explicit registration actions are still shown in the admin forensics history, separate from cookie-presence history.
- The currently installed visual theme is the Alien theme from `color-tool`, deployed under generic asset names: `/static/theme.css`, `/static/img/bg-light.jpg`, and `/static/img/bg-dark.jpg`.
- The old uploadthing CSS files `base.css`, `theme-bridge.css`, `utilities.css`, and `components.css` have been removed.

## Operational Notes

- Recent implementation work for runtime file-type configuration and German UI labels shipped in issue `#88`.
- On the current dev machine, `exammode` is a harmless stub in `PATH`, so toggling internet there does not change real connectivity.
- For admin page testing with more realistic data volume, use start date December 1, 2025.
- `scripts/color-theme.py` can extract Bootstrap 5 CSS variables from an image.
- `scripts/startexam.sh` snapshots home, clears the submissions folder, and archives registrations into `forensic_registrations`.
- Treat the repository root `vacuum.db` as an immutable clean-slate snapshot; copy it to `DATABASE_URL` for writable local or test database use.
