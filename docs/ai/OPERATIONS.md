# OPERATIONS

How this application is deployed and operated. Much of this used to live
only in the operator's head; it is now recorded here (see #132).

## Production Host: OPNsense Firewall

- Uploadthing runs in production on the **OPNsense firewall**, reachable
  via the SSH host alias `sense` (see `Makefile`: `ssh sense copydb`,
  `scp ... sense:uploadthing/`).
- This is not a regular server: the app shares the machine with the
  firewall itself, so resource footprint and failure behavior matter.

## Runtime: Deno On FreeBSD, Keine Prisma-Engines Mehr

- The runtime is **Deno on FreeBSD**.
- Since #133 there are **no Prisma engines** in the stack. Prisma forced
  platform-specific Linux binaries that only ran on the OPNsense through
  the **Linuxulator** and hard-pinned the engine version to 6. Drizzle is
  engine-free pure TypeScript, so the pin and the Linuxulator dependency
  are gone.
- **Schema and migrations**: `drizzle/schema.ts` plus `drizzle/*.sql`.
  Migration SQL is generated on the development machine with
  `deno task db:generate` (`drizzle-kit` carries esbuild binaries — never
  put it on the appliance).
- **Applying migrations** happens automatically at app start via
  `lib/migrate.ts` over `@db/sqlite`, before the first request, in
  `BEGIN EXCLUSIVE` and idempotently. There is **no deploy step to
  forget**: start the app and the schema is current. A manual run is
  available as `deno task db:migrate`.
- If the database knows migrations the running code does not (downgrade
  or a half-written deployment), the app refuses to start with a German
  message instead of running on a half-migrated schema. Rollback path is
  the database backup (#148), not a down-migration.
- Runtime persistence is still plain SQL with hand-written prepared
  statements (`repo/*.ts`); Drizzle is the schema authority only.

## Exam-Sperre über die OPNsense-API

- Die Sperre läuft **ausschließlich** über die Firewall-API
  (`POST /api/firewall/filter/toggleRule/{uuid}` + `apply`,
  gelesen über `POST /api/firewall/filter/searchRule`). Kein `sudo`,
  kein `exammode.sh`, kein Schreiben in `/conf/config.xml`.
- Konfiguration in `.env`: `OPNSENSE_API_URL`, `OPNSENSE_API_KEY`,
  `OPNSENSE_API_SECRET`, `OPNSENSE_EXAMMODE_RULE_UUID` — Key und
  Secret sind beide oder keins; ohne sie ist die Steuerung deaktiviert
  (lokale Entwicklung, Panel zeigt „nicht konfiguriert").
- Der API-Key liegt auf dem Entwicklungsrechner in
  `~/sense.internal_root_apikey.txt` (`key=`, `secret=`, Modus 600).
  Er gehört nur in die Produktions-`.env`, nie ins Repo.
- **TLS:** Das Web-GUI-Zertifikat der Sense ist seit 2026-10-30
  `CN=sense.internal` mit `SAN: DNS:sense.internal, IP:192.168.21.1`,
  signiert von der internen CA „uploadthing internal CA"
  (Trust-Store der Sense, 10 Jahre). Die CA liegt als
  `~/certs/sense-ca.pem` auf dem Dell und wird dem Prozess über
  `DENO_CERT=/home/georg/certs/sense-ca.pem` bekannt gemacht — Deno
  prüft TLS vollständig, es gibt **keine** Abschaltung der Prüfung.
  `OPNSENSE_API_URL=https://sense.internal:8443`; die IP-Adresse ist
  kein SAN, und `tst.spengergasse.at` zeigt ab #143 auf die App.
- **`getRule/{uuid}` ist auf 26.7 unbrauchbar** (antwortet `[]`, auch
  für existierende Regeln). Gelesen wird ausschließlich über
  `POST /api/firewall/filter/searchRule`; `toggleRule` liefert
  `{result: "Enabled"|"Disabled", changed: bool}`.
- **Regel `doku`:** UUID `69c0079a-7b83-4cc2-95b5-78183f4b222b`
  (`descr=doku`, `action=reject`, LAN → alles außer Alias `DOKU`,
  erste Regel der LAN-Gruppe, nach Anti-Lockout und DHCP). Sie wurde am
  2026-10-30 neu angelegt, weil der 26.7-Regelset-Migrationsschritt die
  Legacy-`<filter>`-Regel nicht übernommen hatte; der alte
  `<filter>`-Block mit `e3e720e6-…` ist toter Ballast und fällt in #144.
  **Erledigt am 2026-10-30:** Der `Migration assistant`
  (`/ui/firewall/migration`) hat den Legacy-Block exportiert
  (`appliance/legacy-rules-2026-10-30.csv`, 6 Regeln, CSV mit
  `;`-Trennern) und per `flush` gelöscht. Danach: kein `<filter>`-Block
  mehr in der `config.xml`, keine `e3e720e6`-Referenz, der
  Assistant wird nicht mehr eingeblendet, `pfctl` unverändert
  40 Regeln. Die 27 aktiven Regeln (inkl. `doku`) liegen in
  `<OPNsense><Firewall>`.
- **Der Migration assistant ist kein Konverter**, sondern Export + Flush:
  `countRules`, `downloadRules` (CSV), `flush` (löscht `filter.rule`).
  Die eigentliche Übernahme passierte beim Upgrade automatisch; sie
  übersprang die deaktivierte `doku`-Regel.
- **Zustand:** Das Panel liest den Regelzustand bei jedem Rendern. Kein
  Polling, keine Heilung von Drift — Abweichungen werden sichtbar
  gemacht („Examen läuft · Internet frei", Modal mit API-Fehler).
- **Start:** App-Start bedeutet Exam Mode Off / Internet frei: ein
  hängengebliebener Exam-Zustand wird auf `stopped` gesetzt und die
  Sperrregel gelöst. Schlägt der API-Aufruf fehl, startet die App
  trotzdem (kein `Deno.exit`), der Fehler landet im Log und im Panel.
- **Sperren/Schalten:** `toggleRule` ist ein Toggle. Der Client liest
  zuerst, schaltet nur bei Abweichung, ruft `apply` und liest danach
  erneut zur Bestätigung. Regel-UUIDs werden mit und ohne Bindestriche
  verglichen (config.xml nutzt 32 Hex-Zeichen).
- Die alte `appliance/bin/exammode.sh` bleibt als Host-Werkzeug im Repo,
  wird von der App aber nicht mehr aufgerufen.

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
  packages on `sense`. The Linuxulator remains the pragmatic runtime path
  for Deno itself; since #133 nothing else in the stack needs it.

## Unterlagen (Exam Task Materials)

- Prüfungsunterlagen (Angaben) liegen **flach** in `UNTERLAGEN_DIR` und
  werden seit #134 direkt in der Weboberfläche gepflegt:
  `/admin/application` → „Unterlagen (Angaben)“. Hochladen, Ersetzen
  (nur mit Häkchen „Vorhandene Datei ersetzen“), Einzellöschen und
  „Alle Unterlagen löschen“ — kein SSH-Kopieren mehr.
- Es gibt **keine Unterordner, keine Versionierung und kein Archiv**:
  Unterlagen werden über Examenstermine hinweg wiederverwendet, ein
  Datumsbaum würde nur den Fehler „falscher Ordner“ erzeugen. Ersetzt
  oder gelöscht wird bewusst, nicht historisiert.
- Der Upload ist **unabhängig vom Examenfenster** (Vorbereitung davor).
  Das Gating aus #131 gilt weiterhin nur für Schülerzugriffe:
  `GET /unterlagen/*` und `POST /upload`.
- Dateitypen: eigene Variable `UNTERLAGEN_PERMITTED_FILETYPES` (Default
  `md`), **nicht** `PERMITTED_FILETYPES` (das gilt für Abgaben). Der
  Inhalt wird wie bei Abgaben geprüft (`file-type`/`detectMimeType`);
  `MAX_UPLOAD_MB` gilt auch hier.
- Dateinamen laufen ausschließlich über `safeFileComponent`; ein
  vorhandener Symlink oder Unterordner in `UNTERLAGEN_DIR` wird nicht
  überschrieben.
- Die Schülerseite (`#angaben-list`) liest das Verzeichnis bei jedem
  Rendern neu. Nach Upload/Löschen im Admin-Panel stimmt sie ohne
  zusätzlichen Reload-Mechanismus beim nächsten Aufruf.
- Admins sehen in der Liste genau die Dateien, die Schüler sehen:
  Namen mit führendem `.` oder `_` werden beim Upload abgelehnt, weil
  sie auf der Schülerseite ausgeblendet wären.

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
- **`PUBLIC_URL`** is the address the app presents itself under
  (`https://tst.spengergasse.at/`). Since #149 it also produces the
  browser tab title: `page_title` is the **hostname** of `PUBLIC_URL`
  (`tst.spengergasse.at`), while `LISTEN_HOST` only decides the bind
  address. Without `PUBLIC_URL` the tab falls back to
  `<LISTEN_HOST>:<LISTEN_PORT>` (local development); an unparseable value
  aborts startup with a German message. Both values come from
  `buildHeroUrl()` / `buildPageTitle()` in `lib/config.ts`.
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
- **Cert renewal caveat:** the OPNsense GUI uses a *snapshot* of the
  certificate (imported once into the cert store). After each renewal
  harvest on `kik` + `scp` to `sense`, the GUI's copy must be
  re-imported (replace `crt`/`prv` of the cert item) — otherwise the
  GUI on :8443 serves the stale certificate while the app on 443 is
  current.
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

- Since #145 the app polls the MikroTik REST API itself (every 60 s, from
  the app process). `POST /activeips` no longer exists, so the old
  `nmap_cron.sh`/`scan-*.py` path must not be re-created: it posted to a
  removed endpoint and had been failing every minute since 2026-10-23.
- The appliance files (`appliance/files/…_nmap_cron.sh`, the configd
  `actions.d` snippet, `appliance/bin/scan-*.py`) remain only until the
  separate cleanup ticket deletes them; nothing wires them into the app.

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

## Appliance State 2026-10-21 (gathered from sense)

Full live state gathered into `appliance/current/` (gitignored except
`config.redacted.xml`); `appliance/current/MANIFEST` records sha256 +
mtime of every deployed custom script. Facts:

- Deployed script home is still the old examsense checkout:
  `/root/examsense/` (own `.git`, clean at `9583565` "config saves",
  2026-06-03, remote = archived GitHub repo). `/root/bin` is a symlink
  to `/root/examsense/bin`.
- Drift deployed vs. repo: `devd/usbpersist.conf` matches
  `em[0-9]+` live (repo says `ue[0-9]+`); repo's
  `actions_exampy.conf` ("pfctl_ss") was never deployed — the live,
  **untracked** file is `actions_scan.conf`, identical to live
  `actions_exampy.conf` (section `[scan]` → `nmap_cron.sh`; cron job
  "scan scan" runs the NMAP LAN scan **every minute**).
- `enable/disable_doku_rule.sh` no longer exist on the appliance
  (obsolete, repo copies deletable).
- Deno on `sense`: the app runs from `~/.deno/bin/deno` **2.9.6
  stable** (via `startloop.sh` + `.deno/env` PATH). Two stray copies:
  `~/tmp/deno` (2.2.15 LTS, works) and `~/deno` (**broken** since the
  2026-10-20 upgrade: `liblcms2.so.2 not found` — linux_base-rl9 has
  no lcms2). Consolidation pending, see STATE.md.
- `service uploadthing status` reports "not running" although the app
  listens on 127.0.0.1:8000 — rc pidfile/status quirk, fix candidate.
- Version inventory: OPNsense 26.7.3_11, FreeBSD
  15.1-RELEASE-p3, Python 3.13.15, Nmap 7.991, all packages
  up-to-date (`pkg version -vl "<"` empty). Only relevant Deno patch
  bump available: 2.9.6 → 2.9.7.
- **Deno deprecation** (2026-10-09, Cloudflare acquisition): fixes
  pledged ~1 year, development shutdown 2027. Strategic consequence:
  prioritize #133 (Drizzle — engine-free) and plan a runtime exit
  (Node/Bun) medium-term.

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
  host. (The `exammode` script location — `appliance/bin/exammode.sh` →
  `/root/bin/exammode` — is still recorded above, but the app no longer
  calls it: the exam lock runs over the OPNsense API.)
- Same gap applies to the TLS deployment from #137: how the app
  service on `sense` is supervised/restarted (the repo's
  `startloop.sh` respawn loop with a `STOPPED` marker file is a
  candidate) and how the harvested certificates actually arrive from
  `kik` are still to be recorded after a session on the host.
