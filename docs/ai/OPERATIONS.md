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
- This engine pain is also the historical reason the runtime persistence
  layer uses plain SQL with hand-written prepared statements instead of
  Prisma queries (`repo/*.ts`); Prisma only remains in the loop for
  schema and migrations.

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

## Package Repos On OPNsense

- OPNsense uses its own signed pkg repositories and keeps the FreeBSD
  repos disabled by default (`/etc/pkg/FreeBSD.conf`).
- Officially unsupported and explicitly discouraged: enabling FreeBSD
  repositories under `/usr/local/etc/pkg/repos/` — real-world fallout in
  2026 shows this can break OPNsense major upgrades (26.1 → 26.7).
- The sanctioned way for extra software is building the port on the box
  (`opnsense-code ports && cd /usr/ports/<port> && make install`). For
  Deno this means building V8 from source: hours of build time plus
  recurring maintenance burden across major OPNsense upgrades — not
  worth it.
- Consequence for this project: do not try to install native Deno from
  packages on `sense`. The Linuxulator remains the pragmatic runtime
  path, and the Drizzle migration (#133) shrinks what depends on it —
  after that only Deno itself (if it runs emulated) or nothing.

## Unterlagen (Exam Task Materials)

- Exam task materials (Angaben/Unterlagen) are **copied manually via
  SSH** into the `UNTERLAGEN_DIR` configured on `sense`.
- The **lifecycle is fully manual**: materials are placed before an
  exam and removed by hand afterwards. There is no app feature and no
  automatic cleanup.
- Since #131, student access to `GET /unterlagen/*` is gated to the
  exam window; the manual lifecycle above is orthogonal to that.
- An admin upload feature to replace the SSH step is planned (#134).

## TLS Operation On sense (from #137)

- The Deno webserver is **itself the TLS endpoint** (native TLS via
  `Deno.serve`) — there is **no reverse proxy** in front of it. TLS is
  opt-in via the env pair `TLS_CERT_PATH` / `TLS_KEY_PATH`; see
  `parseTlsConfig()` in `lib/config.ts` (fail-fast when only one is set).
- `Deno.serve` has no separate chain parameter: `TLS_CERT_PATH` must
  point to a **fullchain** file (leaf certificate plus intermediate
  chain, exactly how Certbot delivers `live/<name>/fullchain.pem`).
- Certificates are Let's Encrypt certificates for
  `tst.spengergasse.at`, harvested on `kik` via HTTP-01 and delivered
  to `sense` by manual `scp` (harvest/renewal details: internal project
  KI-Kustodiat-intern #3).
- Planned layout on `sense`: cert directory under georg's home,
  e.g. `~/uploadthing/tls/` (readable by the unprivileged user),
  `privkey.pem` with mode 600, owner `georg`.
- Production env on `sense` sets `TLS_CERT_PATH`, `TLS_KEY_PATH` and
  `LISTEN_PORT=8443`. Port 443 stays occupied by the OPNsense GUI on
  the same host; the clean-URL alternative (GUI on 8443 + DNAT, TLS
  still end-to-end at Deno) is deliberately deferred.
- Public DNS for `tst.spengergasse.at` keeps pointing at `kik` (needed
  for ACME HTTP-01 validation); clients reach `sense` through a
  **split-DNS override** (`tst.spengergasse.at` → sense LAN IP,
  configured in OPNsense Unbound).

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
- Same gap applies to the TLS deployment from #137: how the app
  service on `sense` is supervised/restarted (the repo's
  `startloop.sh` respawn loop with a `STOPPED` marker file is a
  candidate) and how the harvested certificates actually arrive from
  `kik` are still to be recorded after a session on the host.
