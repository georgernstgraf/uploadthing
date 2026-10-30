# OPERATIONS

How this application is deployed and operated. Much of this used to live
only in the operator's head; it is now recorded here (see #132).

## Production Host: Dell (seit 2026-10-30)

- Uploadthing läuft **auf dem Dell** unter `~/uploadthing-app` (eigenes
  Deployment-Verzeichnis, **nicht** das Entwicklungs-Repo — dessen `.env`
  ist eine Dev-Konfiguration).
- Dienst: `systemd/uploadthing.service` (im Repo versioniert, installiert
  unter `/etc/systemd/system/uploadthing.service`). `Restart=always`,
  `EnvironmentFile=/home/georg/uploadthing-app/.env`,
  `AmbientCapabilities=CAP_NET_BIND_SERVICE` für Port 443,
  `WorkingDirectory=/home/georg/uploadthing-app`.
- **Interface:** gelbe USB-NIC `enx7cc2c615cba8`, statisch **192.168.21.2/24**,
  kein Gateway (`ipv4.never-default yes`), DNS **nur** `192.168.21.1`.
  `ExecStartPre` prüft, dass diese Adresse da ist, bevor der Dienst startet.
- **Daten:** `~/uploadthing-app/uploadthing.db` (WAL), `abgaben/`,
  `unterlagen/`. Kopiert von der Sense am 2026-10-30 (105 Abgaben,
  1 Unterlage, DB per `sqlite3.Connection.backup` inkl. WAL-Checkpoint).
- **Suspend:** Der Dell ist ein Laptop. `systemd-inhibit` scheitert als
  `georg` an polkit („Access denied", und die JS-Regeln in
  `/etc/polkit-1/rules.d` werden von polkit 127 hier gar nicht geladen).
  Gelöst über `/etc/systemd/logind.conf.d/uploadthing.conf`:
  `HandleLidSwitch=ignore`, `HandleLidSwitchExternalPower=ignore`,
  `IdleAction=ignore`. Gilt systemweit, auch für die Sense-VM.
- **TLS:** `~/certs/tst.spengergasse.at/{fullchain.pem,privkey.pem}`
  (ECDSA, gültig bis 2027-01-12, von der Sense kopiert). Der alte
  DNAT-Eintrag auf der Sense ist gelöscht; die Sense-GUI lauscht wieder
  auf **443**.
- **Logs:** `journalctl -u uploadthing -f`.

## Runtime: Deno On FreeBSD/Linux, Keine Prisma-Engines Mehr

- The runtime is **Deno on Linux** (Dell, systemd). Bis 2026-10-30 lief
  sie auf FreeBSD in der OPNsense-VM über den Linuxulator; das ist
  entfallen.
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
  `OPNSENSE_API_URL=https://sense.internal` — seit 2026-10-30 lauscht die
  GUI wieder auf **443** (der DNAT 443→8000 und der alte Port 8443 sind
  entfallen, die App braucht die Sense-443 nicht mehr). Die IP-Adresse
  ist kein SAN, und `tst.spengergasse.at` zeigt seit dem Umzug auf die App.
- **`getRule/{uuid}` ist auf 26.7 unbrauchbar** (antwortet `[]`, auch
  für existierende Regeln). Gelesen wird ausschließlich über
  `POST /api/firewall/filter/searchRule`; `toggleRule` liefert
  `{result: "Enabled"|"Disabled", changed: bool}`.
- **Regel `doku`:** UUID `69c0079a-7b83-4cc2-95b5-78183f4b222b`
  (`descr=doku`, `action=reject`, LAN → alles außer Alias `DOKU`,
  erste Regel der LAN-Gruppe, direkt nach Anti-Lockout und DHCP).
  Sie wurde am 2026-10-30 neu angelegt, weil der 26.7-Regelset-Schritt
  die Legacy-`<filter>`-Regel nicht übernommen hatte.
- **Legacy-Block ist weg (2026-10-30):** Der `Migration assistant`
  (`/ui/firewall/migration`) hat die 6 Legacy-Regeln als CSV exportiert
  (`appliance/legacy-rules-2026-10-30.csv`) und per `flush` gelöscht.
  **Dabei gingen fünf aktive Regeln verloren** (u. a. „Default allow LAN
  to any rule"), weil sie im neuen Store nur Verweise auf den Legacy-Block
  waren — Details und Lehre in `PITFALLS.md`, Abschnitt „OPNsense 26.7:
  Migration Assistant". Alle fünf wurden aus dem CSV neu angelegt; `pf`
  hat jetzt 26 API-Regeln (6 eigene + 20 automatische), `doku` bleibt
  deaktiviert.
- **Kategorien:** `doku`, `infra`, `floaty` existieren weiter und sind den
  Regeln zugeordnet (Farben `#74B9FF`, `#44BD32`, `#FBC531`). Zuordnung
  per API **nur mit Kategorie-UUID**, nicht mit dem Namen.

## DNS und Hostnamen auf der Sense

- **Unbound** beantwortet DNS auf Port 53 (`sockstat` zeigt `unbound`,
  nicht `dnsmasq`). Host-Einträge wie `tst.spengergasse.at` liegen daher
  unter `/api/unbound/settings/searchHostOverride` — die dnsmasq-Einträge
  (`/api/dnsmasq/settings/searchHost`) sehen im GUI gleich aus, werden
  aber nicht aufgelöst.
- `tst.spengergasse.at → 192.168.21.2` (Dell), `tik.internal → 192.168.21.5`,
  `sense.internal → 192.168.21.1` (und `.0.38` über das graue Interface).
- Der Dell fragt **ausschließlich** `192.168.21.1` (beide NM-Profile,
  `ipv4.ignore-auto-dns yes`). Ist die Sense aus, hat der Dell kein DNS.
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
- Consequence for this project: on `sense` nothing of the app stack runs
  any more (seit #143). The Linuxulator (Deno on FreeBSD) was only a
  stopgap while the app lived in the OPNsense VM; on the Dell Deno runs
  natively. Nothing in `appliance/` needs Deno.

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
  by manual `scp` (harvest/renewal details: internal project
  KI-Kustodiat-intern #3).
- **Ablage auf dem Dell:** `~/certs/tst.spengergasse.at/fullchain.pem`
  (Kette) und `privkey.pem` (Modus 600, Owner `georg`).
- **Produktions-Env auf dem Dell:** `DENO_ENV=production`,
  `LISTEN_HOST=192.168.21.2`, `LISTEN_PORT=443`,
  `TLS_CERT_PATH=/home/georg/certs/tst.spengergasse.at/fullchain.pem`,
  `TLS_KEY_PATH=…/privkey.pem`, `PUBLIC_URL=https://tst.spengergasse.at/`.
  (Bis #143 stand hier `LISTEN_HOST=127.0.0.1`, `LISTEN_PORT=8000` hinter
  dem DNAT der Sense — entfallen.)
- **`PUBLIC_URL`** is the address the app presents itself under
  (`https://tst.spengergasse.at/`). Since #149 it also produces the
  browser tab title: `page_title` is the **hostname** of `PUBLIC_URL`
  (`tst.spengergasse.at`), while `LISTEN_HOST` only decides the bind
  address. Without `PUBLIC_URL` the tab falls back to
  `<LISTEN_HOST>:<LISTEN_PORT>` (local development); an unparseable value
  aborts startup with a German message. Both values come from
  `buildHeroUrl()` / `buildPageTitle()` in `lib/config.ts`.
- Clean URL `https://tst.spengergasse.at` without port. **Bis 2026-10-30**
  lief das über die Sense: GUI auf 8443, DNAT `192.168.21.1:443` →
  `127.0.0.1:8000` ohne SNAT. Seit dem Umzug auf den Dell terminiert die
  App selbst auf 443, die GUI der Sense ist wieder auf 443, GUI-Port 8443
  und DNAT sind gelöscht. Die alte Topologie steht in `HISTORY.md`.
- **Zertifikatserneuerung:** Ernte auf `kik` (`/etc/letsencrypt/live/…`),
  `scp` nach `~/certs/tst.spengergasse.at/` auf dem Dell, dann
  `systemctl restart uploadthing` (Deno liest Zertifikat und Key beim
  Start). Kein Re-Import in die Sense mehr nötig — die Sense hat ihr
  eigenes internes Zertifikat (`sense.internal`).
- **Dienst:** `systemctl {status,restart,stop} uploadthing`, Logs über
  `journalctl -u uploadthing -f`. Frühere Sense-Details (`rc.d`,
  `startloop.sh`, PIDfile-Quirk, `STOPPED`-Datei) sind mit #143/#144
  entfallen.
- Public DNS für `tst.spengergasse.at` zeigt weiter auf `kik` (nötig für
  ACME HTTP-01); im Prüfungsnetz löst **Unbound** auf der Sense den Namen
  auf `192.168.21.2` auf (siehe Abschnitt „DNS und Hostnamen").

## Appliance Setup (historisch — wird in #144 entfernt)

> **Stand 2026-10-30:** Auf der Sense läuft nichts Eigenes mehr. Die
> folgenden Abschnitte beschreiben die **alte** Appliance-Installation
> und werden mit #144 gelöscht. Sie bleiben bis dahin als Nachschlagewerk
> für das Aufräumen stehen.

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

## Appliance State 2026-10-21 (Stand vor dem Umzug, historisch)

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

## Database Sync Cycle — entfallen (2026-10-30)

Der frühere `Makefile`-Zyklus (`make pull` / `make push` / `make logsync`
gegen `sense`) ist mit dem Umzug überflüssig: App und DB liegen auf dem
Dell, Backups laufen über #148 (gpg-verschlüsselt ins Repo). Die
Makefile-Ziele zeigen noch auf `sense` — beim nächsten Anfassen
entfernen, solange niemand sie benutzt.

## Open Points

- **#144 (offen):** Auf der Sense liegen noch `/home/georg/uploadthing`
  (alter App-Ordner), `/usr/local/etc/rc.d/uploadthing`, die Root-Skripte,
  der Cronjob `scan scan` und das archivierte `examsense`-Repo. Der Dienst
  ist gestoppt (`uploadthing_enable=NO`), gelöscht ist nichts.
- **#149 (offen):** Die App nutzt noch den Root-API-Key der Sense; ein
  eigener Benutzer mit minimalen Rechten (Firewall + Dnsmasq/Unbound)
  fehlt. `/root` ist noch 755. #136 ist noch nicht geschlossen.
- **#148 (offen):** keine automatisierten Backups; das gpg-Backup der
  `config.xml` und eine Restore-Probe fehlen.
- Die TLS-/Zertifikatskette ist oben beschrieben; eine **einmalige
  gedankliche Probe** der Erneuerung (Ernte auf `kik` → `scp` → Restart)
  steht noch aus.
