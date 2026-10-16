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
- The real script lives in this repo: `appliance/bin/exammode.sh`
  (unified start/stop/status since #121). It is deployed to the box
  (`/root/bin/exammode`) via the `appliance/` install path below.

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
- Production env on `sense`: `DENO_ENV=production`, `LISTEN_PORT=8000`,
  `LISTEN_HOST=127.0.0.1` (**loopback only** — port 8000 is not reachable
  from the network), plus `TLS_CERT_PATH` =
  `/home/georg/certs/tst.spengergasse.at/fullchain.pem` and the matching
  `TLS_KEY_PATH`.
- Clean URL `https://tst.spengergasse.at` without port — implemented
  2026-10-16: the OPNsense GUI moved to **8443** (the real LE certificate
  was imported into the OPNsense cert store, descr
  "tst.spengergasse.at (uploadthing cert, ssh import)") and a DNAT port
  forward on the LAN interface (`usblan`) translates
  `192.168.21.1:443` → `127.0.0.1:8000` (`pf rdr`, NAT rule uuid
  `cf776562-1412-47ec-af06-5c0a0cfebd0c`, associated pass rule
  auto-generated via `pass=rule`). **No SNAT** → the real client IPs
  stay visible to the app (verified via `pfctl -s state`); TLS stays
  end-to-end in `Deno.serve`. Pre-change backups:
  `/conf/config.xml.bak-20261016-*` on `sense`.
- Service management on `sense`: rc.d script
  `/usr/local/etc/rc.d/uploadthing` (`uploadthing_enable=YES`, boots
  with the system), running `startloop.sh` (while-loop wrapper) via
  `daemon -u georg`. Caveat: `service uploadthing restart` can no-op
  when the loop shell survives with a stale pidfile — a clean restart
  is: kill both the loop shell and the deno child, remove
  `/var/run/uploadthing.pid`, then `service uploadthing start`. A
  `STOPPED` file in `~/uploadthing` keeps the loop from starting deno
  (deliberate downtime switch — check it before starting).
- Public DNS for `tst.spengergasse.at` keeps pointing at `kik` (needed
  for ACME HTTP-01 validation); clients reach `sense` through a
  **split-DNS override** (`tst.spengergasse.at` → sense LAN IP,
  configured in OPNsense Unbound).

## Appliance Setup (from the former examsense repo)

The `appliance/` directory holds the OPNsense/FreeBSD appliance-side
half of the system (imported from the sister repo `examsense`, now
archived). Layout:

- `appliance/bin/` — scripts for `/root/bin` or a similar PATH location
  (`exammode.sh`, `scan-pfctl.py`, `scan-nmap.py`, `scan-tik.py`,
  `list.awk`, `redact-opnsense.sed`).
- `appliance/files/` — mirrors target appliance paths under
  `/usr/local/...`; filenames are the system path with `/` replaced by
  `_` (e.g. `usr_local_etc_rc.d_uploadthing` →
  `/usr/local/etc/rc.d/uploadthing`).
- `appliance/Mikrotik/` — router config artifacts and command notes.
  **Sensitive:** `show-sensitive` exports and backup commands may
  contain live wireless keys or backup passwords — never commit them.

### Install into /root on the appliance

- Clone or unpack this repository as `root` into `/root/examdns`
  (or deploy the `appliance/` subtree) and make the scripts available
  on PATH, e.g. `ln -s /root/examdns/bin /root/bin`.

### OPNsense base DNS settings

- System → Settings → General: leave `DNS Servers` empty (or configure
  explicitly); enable `Allow DNS server list to be overridden by
  DHCP/PPP on WAN`; enable `Do not use the local DNS service as a
  nameserver for this system`.
- Services → Unbound DNS → Query Forwarding: enable `Use System
  Nameservers`.
- Services → Unbound DNS → Advanced: enable `Log Queries`, `Log
  Replies`, `Tag Queries and Replies`.

### Redirect DNS traffic to Unbound

- Firewall → NAT → Port Forward: redirect all DNS traffic targeting
  `not this firewall:53` to `127.0.0.1:53`.

### Block known DoH endpoints

- Firewall → Aliases: `Type` = `URL Table (IPs)`, source
  `https://raw.githubusercontent.com/crypt0rr/public-doh-servers/main/ipv4.list`.
- Firewall → Rules → LAN: reject port `443` traffic to the DoH alias.

### Scan helper / configd integration

- `appliance/bin/scan-pfctl.py` posts active IPs discovered from
  `pfctl -ss` (this is the data source for the app's `/activeips`
  endpoint).
- Deploy `appliance/files/usr_local_opnsense_scripts_custom_nmap_cron.sh`
  as `/usr/local/opnsense/scripts/custom/nmap_cron.sh`.
- Deploy
  `appliance/files/usr_local_opnsense_service_conf_actions.d_actions_exampy.conf`
  into `/usr/local/opnsense/service/conf/actions.d/`, then
  `service configd restart` and create the cron job in the GUI.

### Uploadthing rc.d service

- Service file: `appliance/files/usr_local_etc_rc.d_uploadthing`.
- Create `33.2/32` as a Proxy ARP address.
- Add a firewall NAT port-forward from `33.2:80` to `localhost:8000`.
- Start with `service uploadthing start` after deployment.

### Additional appliance notes

- Host overrides in use: `router`, `sense`, `tplink`.
- Admin access (System → Admin → Settings): enable SSH + root login
  per appliance policy; passwordless sudo and serial console only when
  needed for recovery.
- USB NIC persistence: install
  `appliance/files/usr_local_sbin_usb_nic_rename.sh` as
  `/usr/local/sbin/usb_nic_rename.sh` (adjust placeholder MACs first)
  and `appliance/files/usr_local_etc_devd_usb_persist.conf` as
  `/usr/local/etc/devd/usb_persist.conf`.
- Shell aliases on the box:
  `alias ub='unbound-control -c /var/unbound/unbound.conf'`,
  `alias ut='tail -F /var/log/resolver/latest.log'`.
- System tunables: `net.inet.tcp.blackhole=0`,
  `net.inet.udp.blackhole=0`, `hw.usb.no_suspend=1`.
- Redacted config snapshots: `make config-snapshot` on the appliance
  writes `appliance/files/conf_config.xml` via
  `appliance/bin/redact-opnsense.sed`; snapshots in the repo are
  redacted (verify before committing new ones).

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

- Exact Deno install/version procedure on `sense` is not yet recorded;
  to be filled in from operator knowledge or a future session on the
  host. (The `exammode` script location is now recorded above:
  `appliance/bin/exammode.sh` → `/root/bin/exammode`.)
- Same gap applies to the TLS deployment from #137: how the app
  service on `sense` is supervised/restarted (the repo's
  `startloop.sh` respawn loop with a `STOPPED` marker file is a
  candidate) and how the harvested certificates actually arrive from
  `kik` are still to be recorded after a session on the host.
