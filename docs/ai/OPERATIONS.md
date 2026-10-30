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
  aber nicht aufgelöst. **dnsmasq bedient nur DHCP** (Port 67); ein
  dnsmasq-Eintrag mit `hwaddr` ist eine DHCP-Reservierung. Der
  `dell`-Eintrag zeigt seit 2026-10-30 auf die MAC des USB-Adapters
  (`7c:c2:c6:15:cb:a8`) statt auf die WLAN-MAC — sonst hätte ein WLAN-
  Client `.2` zusätzlich bekommen (siehe `PITFALLS.md`).
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
- **`ADMIN_IPS`** (Produktions-`.env`): `192.168.21.2, .6, .7, .8, .10`.
  Admin wird nur, wer Klasse `LehrendeR` **hat** und von einer dieser
  Adressen (oder von einer freigegebenen MAC) kommt. `.2` ist der Dell
  selbst — ohne diesen Eintrag scheitert ein Lehrer-Login vom
  Prüfungsserver. Neue Lehrer-Arbeitsplätze brauchen einen Eintrag,
  sonst bleibt der Login bei „Kein Zugriff" stehen; die MAC-Freigabe
  unter `/admin/application` ist der Weg ohne Neustart.
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
- **Ablauf:** `tst.spengergasse.at` ist gültig bis **2027-01-12**.
  Erinnerung im Dezember; Checkliste unten.
- **Dienst:** `systemctl {status,restart,stop} uploadthing`, Logs über
  `journalctl --user -u uploadthing -f`. Frühere Sense-Details (`rc.d`,
  `startloop.sh`, PIDfile-Quirk, `STOPPED`-Datei) sind mit #143/#144
  entfallen.
- **Neustart dauert unter einer Sekunde (#156).** Der Signalhandler in
  `lib/shutdown.ts` beendet den Prozess selbst: Tik-Polling stoppen,
  HTTP-Server abbrechen und auslaufen lassen, SQLite schließen,
  `Deno.exit(0)`. Der Watchdog (10 s) und `TimeoutStopSec=20` im
  Unit-File sind nur Rückfallebenen — im Journal darf **kein** „State
  'stop-sigterm' timed out" mehr auftauchen. Ein zweites Signal beendet
  sofort. Gemessen am 2026-10-31 auf dem Dell: 0,04 s. Warnung: der
  *alte* Prozess hat noch den alten Handler — beim ersten Restart nach
  einem Deploy dieser Änderung dauert der Stopp weiterhin 20 s.
- Public DNS für `tst.spengergasse.at` zeigt weiter auf `kik` (nötig für
  ACME HTTP-01); im Prüfungsnetz löst **Unbound** auf der Sense den Namen
  auf `192.168.21.2` auf (siehe Abschnitt „DNS und Hostnamen").

### Zertifikats-Checkliste (manuell, 2×/Jahr)

1. Auf `kik` ernten: `certbot renew` bzw. die bestehende HTTP-01-Prozedur
   (KI-Kustodiat-intern #3).
2. `scp /etc/letsencrypt/live/<name>/{fullchain.pem,privkey.pem}`
   nach `~/certs/tst.spengergasse.at/` auf dem Dell.
3. Rechte prüfen: `privkey.pem` Modus 600, Owner `georg`.
4. `systemctl --user restart uploadthing` — Deno liest Zertifikat und Key
   **nur beim Start**.
5. Prüfen: `curl -sSI https://tst.spengergasse.at/` → 200, und
   `openssl s_client -connect 192.168.21.2:443 -servername tst.spengergasse.at </dev/null 2>/dev/null | openssl x509 -noout -dates`
   zeigt das neue `notAfter`.
6. `journalctl --user -u uploadthing -n 20` muss
   „Listening on https://192.168.21.2:443/" zeigen — bei einem
   Zertifikatsfehler startet der Dienst nicht.

## OPNsense-API-Zugang der App

- Die App liest und schaltet **nur** `api/firewall/filter/*`
  (`searchRule`, `toggleRule`, `apply`). Genau dafür existiert der eigene
  Benutzer **`uploadthing-api`** (uid 2000, Scope `user`, Shell
  `nologin`) mit dem einzigen Privileg **`page-filter-api`**
  („Firewall: Rules [new]", definiert in
  `/usr/local/opnsense/mvc/app/models/OPNsense/Firewall/ACL/ACL.xml`).
- Sein Key/Secret steht als `OPNSENSE_API_KEY` / `OPNSENSE_API_SECRET` in
  `~/.config/uploadthing/uploadthing.env` (Modus 600). Der **Root-Key**
  in `~/sense.internal_root_apikey.txt` (600) ist nur noch für den
  Menschen da, nicht für die App.
- **Rotation:** `POST /api/auth/user/addApiKey/uploadthing-api` liefert
  ein neues Paar; altes Paar danach mit
  `POST /api/auth/user/delApiKey/{id}` (IDs über
  `searchApiKey/{username}`) entfernen. Die `.env` ändern und
  `systemctl --user restart uploadthing` — der Start löst die Sperre und
  schlägt im Log fehl, wenn die Rechte nicht reichen.
- **Minimalitätsprobe** (muss 403 liefern): derselbe Key gegen
  `api/dnsmasq/settings/searchHost` und `api/auth/user/search`.
- `priv` in der API als **Komma-String** senden, nicht als JSON-Array
  (siehe `PITFALLS.md`).

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
- `appliance/backups/` — gpg-verschlüsselte Vollbackups der
  `config.xml` plus `MANIFEST`; Erzeugen, Prüfen und Wiederherstellen
  stehen im Abschnitt „Konfigurations-Backup".
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

## Konfigurations-Backup (OPNsense, gpg-verschlüsselt, #148)

`config.xml` enthält LDAP-Bind-Passwort, API-Keys, Zertifikate und
WireGuard-Schlüssel; das Repo ist public. Deshalb liegt der Klartext
**nie** im Repo, sondern nur ein GPG-Chiffrat plus Manifest:

- `appliance/backups/config-YYYY-MM-DD.xml.gpg` — mit
  `gpg --encrypt` gegen den Public-Key
  `19BAB05B F4D9 B55D 4907 1A9D EC23 CFDF DDA5 30BD` (Georg Graf,
  Key-ID `EC23CFDFDDA530BD`). `.gitignore` lässt in diesem Verzeichnis
  ausschließlich `*.gpg` und `MANIFEST` durch.
- `appliance/backups/MANIFEST` — TAB-getrennt: Datum,
  OPNsense-Version, sha256 des **Chiffrats**, Empfänger-Key-ID, Datei.
- Der **private Schlüssel liegt nicht im Repo**, sondern nur im Keyring
  des Entwicklungsrechners. Verschlüsseln braucht keinen Secret-Key,
  Entschlüsseln den Keyring — der Key hat **derzeit keine Passphrase**
  (Risiko notiert unter „Restore-Probe").

Der redigierte Snapshot (`make config-snapshot` →
`appliance/current/config.redacted.xml`) bleibt zusätzlich bestehen und
ist für lesbare Diffs zuständig; das Backup ist der vollständige,
wiederherstellbare Stand.

### Backup erzeugen

```sh
scripts/backup-config.sh            # Tagesbackup, bricht ab wenn es eines gibt
scripts/backup-config.sh --force    # vorhandenes Tagesbackup ersetzen
```

Das Skript (POSIX `sh`, fail-strict) prüft die Voraussetzungen (gpg,
ssh, ssh-Ziel per `OPNSENSE_REMOTE`, Public-Key im Keyring), liest
`/conf/config.xml` mit `ssh sense 'sudo -n cat /conf/config.xml'` in ein
temporäres Verzeichnis (`umask 077`, wird beim Verlassen gelöscht),
weist leere Ausgabe und fehlendes `<opnsense>`-Element ab,
verschlüsselt, legt das Chiffrat atomar ab (`*.part` + `mv`, danach
sha256-Nachkontrolle) und ergänzt das Manifest. Ein vorhandenes Chiffrat
für denselben Tag wird nur mit `--force` ersetzt; der Manifest-Eintrag
wird dann ersetzt, nicht dupliziert.

Nach jeder inhaltlichen Änderung an der Sense (Filterregeln, Aliase,
DHCP, Unbound, Zertifikate, WireGuard) ein Backup ziehen und committen —
und vor jedem geplanten Firmware-Upgrade. Kein Cron: die Entscheidung aus
#148 ist bewusst „manuell vor/nach Änderungen".

### Backup prüfen

```sh
gpg --list-packets --verbose appliance/backups/*.gpg
# gpg: using subkey B84DC90813C71134 instead of primary key EC23CFDFDDA530BD
gpg --list-only --decrypt --status-fd 1 appliance/backups/*.gpg
# [GNUPG:] ENC_TO B84DC90813C71134 18 0
sha256sum appliance/backups/*.gpg        # muss zur MANIFEST-Zeile passen
```

Der Empfänger im Chiffrat ist immer der **Encryption-Subkey**
`B84DC90813C71134`; die primäre Key-ID `EC23CFDFDDA530BD` (die im
Manifest steht und als `--recipient` verwendet wird) nennt
`--list-packets` nur mit `--verbose` und nur auf einem Rechner, der den
Secret-Key hat. `--list-only --decrypt` gibt ohne Passphrase keinen
Klartext aus, mit `--status-fd 1` aber den Empfänger.

Kein Klartext in der History (Abnahmekriterium aus #148):

```sh
git log --all --diff-filter=A --name-only | grep -v '\.gpg$' | grep config.xml
```

### Wiederherstellen

Nicht auf der produktiven Sense üben — die Probe läuft auf einer
Wegwerf-VM (siehe unten).

1. **Beleg prüfen:** Chiffrat aus dem Repo nehmen und sha256 gegen die
   `MANIFEST`-Zeile vergleichen (Abschnitt „Backup prüfen").
2. **Entschlüsseln** auf dem Rechner mit dem Secret-Key:
   `gpg --output config.xml --decrypt appliance/backups/config-YYYY-MM-DD.xml.gpg`
   (ohne Passphrase, siehe Risiko-Hinweis). Das Ergebnis ist Klartext mit allen Secrets:
   nach dem Restore löschen (`shred -u config.xml`), niemals committen,
   nicht nach `appliance/` kopieren.
3. **Zielsystem angleichen** (siehe „Was nach dem Restore gilt"):
   OPNsense-Version und Plugin-Set müssen zum Backup passen.
4. **Restore:** GUI → System → Configuration → Backups → „Restore
   configuration", Datei hochladen, „Reboot after restore" setzen. Auf
   der Konsole (seriell/VirtualBox-Konsole, **nicht** SSH) geht es auch
   direkt, ohne GUI-Validierung:
   `cp config.xml /conf/config.xml && reboot`. Der Weg über die GUI ist
   der unterstützte; die Konsole ist der Rückfall, wenn die Netzwerk-
   Konfiguration des Backups nicht zur Hardware passt.
5. **Prüfen:** Interfaces zugewiesen, LAN-Adresse, DHCP, Unbound,
   Filterregeln/Aliase, WireGuard-Peers, Zertifikate, API-Zugriff.

**Was nach dem Restore gilt:**

- **Reboot ist der sichere Weg.** OPNsense liest `/conf/config.xml` beim
  Boot und baut daraus alle Subsysteme auf. Ohne Reboot greifen nur
  einzelne Dienste, die man von Hand anstößt — `configctl filter reload`,
  `configctl unbound restart`, `configctl dhcpd restart`,
  `configctl webgui restart` — und die GUI bietet den Reboot nach dem
  Restore ohnehin an. Ein Restore ersetzt jede zwischenzeitliche
  Änderung, auch die, die man vergessen hat zu sichern.
- **Sitzungen brechen ab:** SSH-Verbindung und GUI-Session sterben mit dem
  WebGUI-Restart; das GUI-Zertifikat kann sich ändern (Ausnahme neu
  bestätigen). Bei kaputter Netzwerk-Konfiguration hilft nur die
  Konsole.
- **API-Keys sind Teil des Backups.** Der Key/Secret des App-Benutzers
  steckt in `config.xml`; nach einem Restore muss
  `OPNSENSE_API_KEY`/`OPNSENSE_API_SECRET` in der `.env` auf dem Dell
  dazu passen, sonst schlägt die Exam-Sperre fehl (fail-loud, siehe
  „Exam-Sperre über die OPNsense-API"). Stammt das Backup aus der Zeit
  vor dem Key, neuen Key anlegen, `.env` nachziehen, Dienst neu starten.
- **Plugin-Versionen:** `config.xml` enthält die Plugin-*Konfiguration*,
  nicht die Pakete. Fehlt ein Plugin, bleiben seine Menüpunkte und
  configd-Aktionen wirkungslos; ein zusätzlich installiertes Plugin
  behält seine Defaults. Vor dem Restore `pkg info -q | grep '^os-'`
  gegen den Stand im Backup vergleichen und fehlende Plugins über
  System → Firmware → Plugins **vorher** installieren. Ein Restore über
  Major-Versionen hinweg ist nicht supported — die Box steht auf
  `26.7.3_11`; erst Firmware-Upgrade, dann Restore.
- **NIC-Zuordnung:** Weicht die Hardware ab, im Konsolenmenü (Option 1,
  „Assign interfaces") neu zuweisen, sonst sind LAN/WAN vertauscht.
- **App und Datenbank sind nicht Teil des Backups.** Das Backup enthält
  ausschließlich die Firewall-Konfiguration; DB-Backups liegen beim
  App-Betrieb auf dem Dell.

### Restore-Probe

**Was am 2026-10-30 geprüft wurde (XML-Ebene, ohne VM):**

- Chiffrat `appliance/backups/config-2026-10-30.xml.gpg` entschlüsselt,
  sha256 gegen `MANIFEST` geprüft.
- Das Ergebnis ist **byte-identisch** mit `/conf/config.xml` auf der Sense
  (sha256 `3749dfe3…`), wohlgeformt, 30 Top-Level-Bereiche.
- Inhaltlich geprüft: Interfaces `lo0`/`lan`/`wan`, beide Benutzer
  (`root`, `uploadthing-api`), alle sechs Automation-Regeln unter
  `OPNsense/Firewall/Filter/rules` (inklusive `doku`, `enabled=0`), keine
  Reste des gelöschten Cronjobs `scan scan`. Klartext danach gelöscht.
- **Nicht geprüft:** der Weg über die GUI bzw. `/conf/config.xml` auf
  einer laufenden Box. Dafür ist eine Wegwerf-VM nötig, die **nicht** ins
  Prüfungsnetz darf — ein Boot mit `192.168.21.1` kollidiert mit der
  produktiven Sense.

**Offene Checkliste für die VM-Probe:**

- [x] Chiffrat aus dem Repo entschlüsseln, sha256 gegen `MANIFEST`
- [ ] OPNsense-VM in VirtualBox mit derselben Version (`26.7.3_11`)
      aufsetzen, **ohne** Anschluss an das Prüfungsnetz
- [ ] Plugin-Set der VM gegen den Stand im Backup angleichen
- [ ] Restore über die GUI mit „Reboot after restore"
- [ ] Nach dem Boot: Interface-Zuordnung, LAN-Adresse (`192.168.21.1`),
      DHCP, Unbound (Host-Overrides `router`/`sense`/`tplink`),
      Filterregeln und Aliase vollständig, WireGuard-Peers,
      Zertifikate gültig
- [ ] API-Zugriff mit Key/Secret aus der `.env` testen
      (`POST /api/firewall/filter/searchRule`), Exam-Sperre schalten
- [ ] Abweichungen notieren (Datum, Version, was fehlte)
- [ ] Hinweis am VM-Netzadapter: erster Start nur mit „Not attached",
      IP danach auf etwas anderes als `.1` setzen

> **Risiko, offen:** Der GPG-Key `EC23CFDFDDA530BD` hat derzeit **keine
> Passphrase** — Entschlüsseln läuft ohne Rückfrage, d. h. wer Zugriff auf
> `~/.gnupg` hat, hat auch die Firewall-Secrets. Abwägung: Passphrase
> bedeutet, dass ein Restore nicht mehr unbeaufsichtigt möglich ist.
> Entscheidung steht noch aus; bis dahin bleibt der Keyring der
> Schutzmechanismus (Modus 700, keine Kopie im Repo).

## Database Sync Cycle — entfallen (2026-10-30)

Der frühere `Makefile`-Zyklus (`make pull` / `make push` / `make logsync`
gegen `sense`) ist mit dem Umzug überflüssig; das `Makefile` hat nur noch
`config-snapshot`. App und DB liegen auf dem Dell, Backups laufen über
`scripts/backup-config.sh`.

## Open Points

- **#144 (erledigt 2026-10-30):** Repo-Teil (siehe oben) und Sense:
  Cronjob `scan scan` per API entfernt (`configctl cron restart`),
  `/root/examsense`, `/root/bin`, `/usr/local/sbin/exammode.sh`,
  `actions_scan.conf`/`actions_exampy.conf`, `nmap_cron.sh`,
  `rc.d/uploadthing`, `/home/georg/uploadthing` und die alte
  `uploadthing.db` gelöscht; configd neu gestartet. MikroTik:
  `service-monitor` entfernt, `uploadthing` strikt auf
  `192.168.21.2/32`. GitHub-Repo `georgernstgraf/examsense` gelöscht
  (Bundle + Tarball in `~/uploadthing-archive/`). Abnahme: keine Treffer
  mehr unter `/root`, `/usr/local`, `/home/georg`; `grep -c "scan scan"`
  in `config.xml` und den Crontabs → 0.
- **#149 (erledigt 2026-10-30):** eigener API-Benutzer
  `uploadthing-api` mit `page-filter-api` (Root-Key nur noch für den
  Menschen), `/root` auf 750, Key-Datei 600, `page_title` aus
  `PUBLIC_URL`, `ADMIN_IPS` enthält `.2`, dnsmasq-`dell`-Eintrag auf die
  USB-MAC korrigiert, Zertifikats-Checkliste oben. #136 war bereits
  geschlossen.
- **#148 (Repo-Teil erledigt):** siehe „Konfigurations-Backup".
  Restore-Probe auf XML-Ebene durchgeführt; die VM-Probe bleibt offen
  (Checkliste oben).
- Die TLS-/Zertifikatskette ist oben beschrieben; eine **einmalige
  gedankliche Probe** der Erneuerung (Ernte auf `kik` → `scp` → Restart)
  steht noch aus.
