# OPERATIONS

How this application is deployed and operated. Much of this used to live
only in the operator's head; it is now recorded here (see #132).

## Production Host: Dell (seit 2026-10-30)

- Uploadthing läuft **auf dem Dell** direkt aus dem Arbeits-Repo
  `/home/georg/repos/georgernstgraf/uploadthing` (kein separates
  Deployment-Verzeichnis mehr).
- Dienst: **systemd-User-Unit** `~/.config/systemd/user/uploadthing.service`
  (Quelle im Repo: `systemd/uploadthing.service`), `Restart=always`,
  `WorkingDirectory` = Repo, `EnvironmentFile` =
  `~/.config/uploadthing/uploadthing.env` (Modus 600, **nicht** das
  Dev-`.env` im Repo). Nach einer Änderung an der Unit-Datei im Repo:
  `cp systemd/uploadthing.service ~/.config/systemd/user/ &&
  systemctl --user daemon-reload && systemctl --user restart uploadthing`.
- **Port 443 ohne root:** User-Units können kein `AmbientCapabilities`
  setzen (der User-Manager hat keine Rechte). Stattdessen
  `/etc/sysctl.d/99-uploadthing-ports.conf` mit
  `net.ipv4.ip_unprivileged_port_start = 443` — damit darf jeder Prozess
  von `georg` auf 443 binden, ohne Capability und ohne `setcap` auf der
  Deno-Binary (das würde bei jedem Upgrade verloren gehen).
- **Autostart ohne Login:** `loginctl enable-linger georg` (Linger=yes),
  damit der User-Manager beim Boot läuft; die Unit hängt an
  `default.target` (User-Scope).
- **Interface:** gelbe USB-NIC `enx7cc2c615cba8`, statisch
  **192.168.21.2/24**, kein Gateway (`ipv4.never-default yes`), DNS
  **nur** `192.168.21.1`. `ExecStartPre` prüft, dass diese Adresse da
  ist, bevor der Dienst startet.
- **Daten liegen außerhalb des Repos:** `~/uploadthing-data/`
  mit `uploadthing.db` (WAL), `abgaben/` (105 Dateien), `unterlagen/`
  (1 Datei). `DATABASE_URL` ist deshalb ein **absoluter** `file:`-Pfad —
  ein relatives `file:../uploadthing.db` würde im Repo auf die
  Entwicklungs-DB zeigen.
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
- **Logs:** `journalctl --user -u uploadthing -f`.

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
  kein Host-Skript, kein Schreiben in `/conf/config.xml`.
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
- Die frühere Umschaltung per Host-Skript ist mit #144 entfallen; es gibt
  kein Shell-Werkzeug mehr für die Sperre.

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
  `journalctl --user -u uploadthing -f`. Frühere Sense-Details (`rc.d`,
  `startloop.sh`, PIDfile-Quirk, `STOPPED`-Datei) sind mit #143/#144
  entfallen.
- Public DNS für `tst.spengergasse.at` zeigt weiter auf `kik` (nötig für
  ACME HTTP-01); im Prüfungsnetz löst **Unbound** auf der Sense den Namen
  auf `192.168.21.2` auf (siehe Abschnitt „DNS und Hostnamen").

## Appliance-Artefakte (Restbestand seit #144)

> Auf der Sense läuft seit #143 nichts Eigenes mehr; #144 hat die
> Appliance-Skripte, den rc.d-Service, die configd-Snippets und den
> Nmap-Cron entfernt. Was im Repo bleibt, ist Nachschlage- und
> Belegmaterial — kein lauffähiger Code. Die frühere
> Appliance-Installation steht als Superseded-Eintrag in `HISTORY.md`.

- `appliance/bin/redact-opnsense.sed` redigiert `/conf/config.xml`;
  `make config-snapshot` (auf der Sense ausführen) schreibt das Ergebnis
  nach `appliance/current/config.redacted.xml`. Alles außer dieser einen
  Datei unter `appliance/current/` ist gitignored und kann Secrets
  enthalten — neue Snapshots vor dem Commit prüfen.
- `appliance/files/usr_local_etc_devd_usb_persist.conf` →
  `/usr/local/etc/devd/usb_persist.conf`. Die MAC-Zuordnung der USB-NICs
  steht in der Datei und muss zur Hardware passen.
- `appliance/Mikrotik/` — RouterOS-Export (PSK redigiert) und
  Kommandonotizen. `show-sensitive`-Exporte und Backup-Passwörter bleiben
  draußen; das Export trägt Gerätekennungen (Serial, `admin-mac`).
- `appliance/legacy-rules-2026-10-30.csv` — Beleg für die sechs
  Legacy-Filterregeln (siehe „Legacy-Block ist weg" oben).

### Sense-Grundkonfiguration (weiterhin gültig)

- System → Settings → General: `DNS Servers` leer lassen (oder explizit
  setzen), Override durch DHCP/PPP auf WAN erlauben, „Do not use the local
  DNS service as a nameserver for this system" aktivieren. Services →
  Unbound DNS: Query Forwarding „Use System Nameservers"; Advanced:
  `Log Queries`, `Log Replies`, `Tag Queries and Replies`.
- Firewall → NAT → Port Forward: DNS-Verkehr an „not this firewall:53"
  auf `127.0.0.1:53` umleiten.
- DoH-Sperre: Alias `Type` = `URL Table (IPs)` auf
  `https://raw.githubusercontent.com/crypt0rr/public-doh-servers/main/ipv4.list`,
  LAN-Regel reject 443 auf dieses Alias.
- Host-Overrides in Gebrauch: `router`, `sense`, `tplink`.
- Shell-Aliase auf der Box:
  `alias ub='unbound-control -c /var/unbound/unbound.conf'`,
  `alias ut='tail -F /var/log/resolver/latest.log'`. Tunables:
  `net.inet.tcp.blackhole=0`, `net.inet.udp.blackhole=0`,
  `hw.usb.no_suspend=1`.
- Admin-Zugang (System → Admin → Settings): SSH + Root-Login nach
  Appliance-Policy; passwortloses sudo und serielle Konsole nur zur
  Wiederherstellung.

## Database Sync Cycle — entfallen (2026-10-30)

Der frühere `Makefile`-Zyklus (`make pull` / `make push` / `make logsync`
gegen `sense`) ist mit dem Umzug überflüssig: App und DB liegen auf dem
Dell, Backups laufen über #148 (gpg-verschlüsselt ins Repo). Die
Makefile-Ziele zeigen noch auf `sense` — beim nächsten Anfassen
entfernen, solange niemand sie benutzt.

## Open Points

- **#144 (Repo-Teil erledigt):** `appliance/` ist auf Redaktionsskript,
  `usb_persist.conf`, MikroTik-Material, redigierten Snapshot und die
  Legacy-CSV geschrumpft. Auf der Sense selbst sind `/home/georg/uploadthing`,
  `/usr/local/etc/rc.d/uploadthing`, die Root-Skripte, der Cronjob
  `scan scan` und das archivierte `examsense`-Repo **noch** vorhanden —
  der Dienst ist gestoppt (`uploadthing_enable=NO`), gelöscht ist dort
  nichts.
- **#149 (offen):** Die App nutzt noch den Root-API-Key der Sense; ein
  eigener Benutzer mit minimalen Rechten (Firewall + Dnsmasq/Unbound)
  fehlt. `/root` ist noch 755. #136 ist noch nicht geschlossen.
- **#148 (offen):** keine automatisierten Backups; das gpg-Backup der
  `config.xml` und eine Restore-Probe fehlen.
- Die TLS-/Zertifikatskette ist oben beschrieben; eine **einmalige
  gedankliche Probe** der Erneuerung (Ernte auf `kik` → `scp` → Restart)
  steht noch aus.
