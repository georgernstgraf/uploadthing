# PITFALLS

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

## Theme Asset Workflow

- Do not edit `/static/theme.css` when switching visual themes; it is meant to stay a direct copy from `color-tool`.
- Uploadthing-specific adaptation belongs in `/static/app.css`.
- The installed theme background images must use the generic filenames `/static/img/bg-light.jpg` and `/static/img/bg-dark.jpg`.
- The light/dark toggle must not swap CSS files at runtime; only the background image and `data-bs-theme` mode should change.
- Do not reintroduce the old local CSS stack unless there is a deliberate architectural reason; the goal is to stay close to Bootstrap plus the color-tool files.

## Generated Artifacts

- `lib/prismaclient/` is generated output.
- Avoid hand-editing generated Prisma client files unless the task explicitly requires generated-code changes.
