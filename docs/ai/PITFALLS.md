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

## External Dependency Risks

- LDAP access can be slow or unavailable; the code includes reconnect logic and retry timing.
- Do not start LDAP connections at module import time; eager startup causes unrelated tests to leak timers, reads, and TLS handshakes.
- Browser-visible flows may also depend on local directories such as `ABGABEN_DIR` and `UNTERLAGEN_DIR` existing and being readable.

## Generated Artifacts

- `lib/prismaclient/` is generated output.
- Avoid hand-editing generated Prisma client files unless the task explicitly requires generated-code changes.
