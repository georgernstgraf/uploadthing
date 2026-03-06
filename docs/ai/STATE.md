# STATE

## Current Entry Points

- `main.ts` starts the Hono app with `Deno.serve`.
- `main.ts` owns centralized SIGINT/SIGTERM shutdown, aborts the HTTP server via `AbortController`, then closes Prisma and SQLite.
- Middleware order is `sessionMiddleware` first, then `remoteIPMiddleware`.
- Routers are mounted for admin, upload, auth, API, home, and static/file serving.

## Route Inventory

- `routes/home.ts`: renders the main page and available `unterlagen` files.
- `routes/auth.ts`: `GET /whoami`, `GET /ldap`, `POST /register`.
- `routes/upload.ts`: authenticated upload form and submission handling.
- `routes/api.ts`: `POST /activeips` for IP activity ingestion.
- `routes/admin.ts`: admin overview, runtime file type settings for teachers, download of submissions plus DB backup, and a wipe action for the submissions directory.
- `routes/files.ts`: serves `static/` and authenticated `unterlagen/` files.
- Admin navigation now shows two teacher-only entries: `Schüler` for the existing admin overview and `Dateitypen` for runtime upload policy settings.

## Service And Repo Layout

- `service/service.ts` re-exports `ipfact`, `ldap`, `registrations`, `user`, `abgaben`, `ipadmin`, and `admin` services.
- `repo/repo.ts` re-exports Prisma access, SQLite access, and repository modules.
- `repo/prismadb.ts` owns Prisma lifecycle.
- `repo/db.ts` owns the shared SQLite connection and WAL mode.
- `repo/ldapuser.ts` now creates the LDAP client lazily on first real LDAP access instead of at import time.

## Data Model

- Prisma schema lives in `prisma/schema.prisma`.
- Tables/models in active use: `users`, `ipfact`, `registrations`, `forensic_registrations`, `abgaben`.
- `users` is accessed through Prisma.
- The remaining operational tables use direct SQLite queries.

## Sessions And Auth State

- Session cookies contain `{ email, createdAt }`, encoded and HMAC-signed.
- Request state in Hono context includes `remoteip`, `remoteuser`, `session`, and `is_admin`.
- On each request, the session email is resolved back to a user record and registration may be refreshed for the current IP.

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

## Operational Notes

- Recent implementation work for runtime file-type configuration and German UI labels shipped in issue `#88`.
- For admin page testing with more realistic data volume, use start date December 1, 2025.
- `scripts/color-theme.py` can extract Bootstrap 5 CSS variables from an image.
- `scripts/startexam.sh` snapshots home, clears the submissions folder, and archives registrations into `forensic_registrations`.
- Treat the repository root `vacuum.db` as an immutable clean-slate snapshot; copy it to `DATABASE_URL` for writable local or test database use.
