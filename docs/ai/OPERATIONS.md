# OPERATIONS

How this application is deployed and operated. Much of this used to live
only in the operator's head; it is now recorded here (see #132).

## Production Host: OPNsense Firewall

- Uploadthing runs in production on the **OPNsense firewall**, reachable
  via the SSH host alias `sense` (see `Makefile`: `ssh sense copydb`,
  `scp ... sense:uploadthing/`).
- This is not a regular server: the app shares the machine with the
  firewall itself, so resource footprint and failure behavior matter.

## Runtime: Deno On FreeBSD, Prisma Via Linuxulator

- The runtime is **Deno on FreeBSD**.
- Prisma's engines are platform-specific **Linux binaries**; they run on
  the OPNsense only through the **Linuxulator** (FreeBSD's Linux binary
  emulation).
- Because of that, Prisma is **hard-pinned to version 6**
  (`deno.json` imports + `deno.lock`). Newer engine versions are not
  trustworthy under the Linuxulator, and an accidental version bump can
  break migration capability on `sense` — typically discovered only at
  the next deployment.
- **Do not bump the Prisma version** until the planned Drizzle migration
  (#133) removes Prisma entirely. Drizzle is engine-free pure TS and
  eliminates the Linuxulator dependency and the pin in one move.

## Exam Mode Command

- `EXAMMODE_COMMAND` names a system command in `PATH` on the box that
  toggles the firewall's internet blocking (`start` semantics are
  internal to that script; the app calls it with `enable`/`disable`
  style invocations via `service/admin.ts`).
- Since #131 the startup semantics are: application start always means
  exam mode off / internet free, and a stuck exam state is reset to
  `stopped`.
- In the dev environment `.env` sets `EXAMMODE_COMMAND=true` (a stub
  that just exits 0), so local tests verify wiring only, not a real
  firewall change.

## Unterlagen (Exam Task Materials)

- Exam task materials (Angaben/Unterlagen) are **copied manually via
  SSH** into the `UNTERLAGEN_DIR` configured on `sense`.
- The **lifecycle is fully manual**: materials are placed before an
  exam and removed by hand afterwards. There is no app feature and no
  automatic cleanup.
- Since #131, student access to `GET /unterlagen/*` is gated to the
  exam window; the manual lifecycle above is orthogonal to that.
- An admin upload feature to replace the SSH step is planned (#134).

## Database Sync Cycle (from the dev machine)

Driven by the `Makefile` on the development machine:

- `make pull`: guard (`! fuser uploadthing.db` — local DB must not be
  in use), remove local `uploadthing.db*`, `ssh sense copydb`, `scp`
  the DB from `sense`, and copy it to `~/OneDrive/` as an off-site copy.
- `make push`: `VACUUM INTO '/tmp/uploadthing.db'` locally, `scp` it to
  `sense:uploadthing/`, remove the temp file.
- `make logsync`: `rsync` app logs from `sense:/var/log/exampy/` into
  the local `~/exampy/` directory.

## Open Points

- Exact Deno install/version procedure on `sense` and where the
  `exammode` script lives on the box are not yet recorded; to be filled
  in from operator knowledge or a future session on the host.
