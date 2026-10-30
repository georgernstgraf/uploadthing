Last updated: 2026-10-30 (#143 Cutover erledigt — App läuft auf dem Dell).

## #134 — Admin-Upload Unterlagen (erledigt)

- `/admin/application` hat den Bereich „Unterlagen (Angaben)“: hochladen,
  ersetzen (nur mit Häkchen „Vorhandene Datei ersetzen“, zusätzlich
  Bestätigungsdialog), einzeln löschen, „Alle Unterlagen löschen“
  (mit Bestätigungsfeld `confirm_delete_all`). Nur Admins
  (`requireAdmin`), Schüler bekommen 403.
- Ablage bleibt flach in `UNTERLAGEN_DIR`: keine Unterordner, keine
  Versionierung, kein Archiv. Löschen entfernt nur Dateien; Unterordner
  und Symlinks bleiben unberührt.
- Neue Env `UNTERLAGEN_PERMITTED_FILETYPES` (Default `md`, Komma-Liste,
  Punkte optional). Getrennt von `PERMITTED_FILETYPES` (Abgaben),
  `MAX_UPLOAD_MB` wird wiederverwendet, Inhalt wird wie bei Abgaben
  gesnifft. Eine gesetzte, leere Liste ist ein Startfehler.
- Der Upload ist **nicht** am Examenfenster gated; #131 gilt weiter nur
  für `GET /unterlagen/*` und `POST /upload`.
- `main.ts` legt `UNTERLAGEN_DIR` beim Start an (wie `ABGABEN_DIR`).
- Kein Reload-Mechanismus für `#angaben-list` nötig: die Schülerseite
  liest das Verzeichnis bei jedem Rendern neu.

## #146 — Eine Schülerseite (erledigt)

- `/` ist die einzige Schülerseite: links Angaben (vollständig) und
  Doku-Links (`#doku-list`, scrollbar), rechts Anmeldung bzw. Abgabe
  (`#abgabe-panel`). Schüler sehen keine Navigation, nur „Abmelden";
  Admins behalten die volle Navigation.
- Namenssuche über `givenName`/`sn`/`mail`/`sAMAccountName` ab 3 Zeichen,
  Anzeige „Vorname Nachname · Klasse" ohne E-Mail. Die Suche legt keine
  Benutzer mehr an; registriert wird beim Klick (`resolveLoginUser`).
- Während eines Examens ist die Neuanmeldung als Nicht-`LehrendeR`
  gesperrt; Admins haben unter dem Formular den Knopf „Anmeldefenster für
  5 Minuten freigeben" (`POST /api/exam/registration-window`, Freigabe nur
  im Prozessspeicher).
- `GET /upload` leitet auf `/`; `POST /upload` liefert das Panel plus
  Toast, es gibt keine Erfolgsseite mehr. Die Vorlagen `upload.hbs`,
  `dirindex.hbs` und `success.hbs` sind entfernt (`home.hbs`,
  `abgabe.hbs`, `login-panel.hbs`, `admin-registration-window.hbs` neu).
- Deployment ist erfolgt (2026-10-30, Dell). Keine Schemaänderung in
  diesem Ticket — nur Verhalten und UI.

## #147 — Admin-Freigabe per MAC (erledigt)

- Neue Tabelle `adminmac` (`mac`, `comment`, `created_at`), Migration
  `0002_adminmac`, läuft beim App-Start. Gepflegt unter
  `/admin/application` (hinzufügen mit Kommentar, entfernen).
- Anmeldung als `LehrendeR` von einer IP aus `ADMIN_IPS` **oder** von einer
  freigegebenen MAC (DB oder `ADMIN_MACS`). Die Klasse bleibt zwingend:
  ein Schüler von freigegebener MAC wird nicht Admin.
- MAC zur IP kommt aus der jüngsten `ipfact`-Sichtung; kein Tik-Abruf im
  Request-Pfad.
- `ADMINS` ist entfernt (war im TypeScript nie gelesen).
- Deployment ist erfolgt; die Migration legte nur eine Tabelle an
  (`adminmac`).

## #145 — Tik-Polling (erledigt)

- `service/tik.ts` pollt `registration-table` beim Start und alle 60 s,
  speichert IP + MAC in `ipfact` und hält den Abrufzustand für das
  Admin-Panel. `POST /activeips`, `ACTIVEIPS_ALLOWED_IPS`,
  `routes/machine.ts` und `service/ipfact.ts` sind entfernt.
- Migration `0001_ipfact_mac` (`ALTER TABLE ipfact ADD mac text`), läuft
  beim App-Start. Auf dem Dell angewendet am 2026-10-30.
- Für den Produktivbetrieb müssen `TIK_URL`, `TIK_USER`, `TIK_PASSWORD` in
  die Produktions-`.env`; ohne sie startet die App (Polling aus, Panel
  „nicht konfiguriert"), erfasst aber keine IPs.
- Darauf aufbauend ist #147 (MAC-basierte Admin-Freigabe) umgesetzt.

## #143 — Umzug auf den Dell (erledigt am 2026-10-30)

Die App läuft **nicht mehr auf der Sense**. Details in `OPERATIONS.md`
(Abschnitt „Production Host: Dell").

- Deployment: `~/uploadthing-app` (eigenes Verzeichnis, Klon von GitHub),
  Produktions-`.env` dort (Modus 600, nicht im Repo).
- `systemd/uploadthing.service` im Repo, installiert unter
  `/etc/systemd/system/`, `Restart=always`, `CAP_NET_BIND_SERVICE`,
  `ExecStartPre` prüft die Adresse `192.168.21.2` auf `enx7cc2c615cba8`.
- Daten von der Sense kopiert (105 Abgaben, 1 Unterlage, DB per
  `sqlite3.Connection.backup` inklusive WAL). Beim ersten Start:
  `0000_baseline` als angewendet erkannt, `0001_ipfact_mac` und
  `0002_adminmac` angewendet.
- `tst.spengergasse.at` zeigt per **Unbound**-Host-Override auf
  `192.168.21.2`; die Sense-GUI ist zurück auf **443**, der DNAT
  443→8000 und der Port 8443 sind entfallen.
- End-to-End geprüft: `https://tst.spengergasse.at/` → 200 mit gültigem
  Zertifikat, Titel `tst.spengergasse.at`, neue Schülerseite; Dienst
  überlebt `restart`; Tik-Polling liefert Clients.
- Die alte Instanz auf der Sense ist gestoppt und `uploadthing_enable=NO`;
  Verzeichnis und `rc.d`-Skript sind **noch nicht** gelöscht (#144).
- **Suspend:** `systemd-inhibit` scheitert an polkit; gelöst über
  `/etc/systemd/logind.conf.d/uploadthing.conf` (Lid-Switch/Idle ignorieren).

## #149 — Code-Teil (erledigt)

- `page_title` kommt aus `PUBLIC_URL` (Hostname), Fallback
  `LISTEN_HOST:LISTEN_PORT`; unparsebare `PUBLIC_URL` ist ein Startfehler.
- Offene Ops-Punkte von #149: eigener API-User mit minimalen Rechten
  (aktuell läuft die App mit dem Root-Key), `/root` auf 750, #136
  schließen, Zertifikats-Checkliste.

## Sofort weiter mit

**#144 — Appliance-Cleanup.** Auf der Sense aufräumen, was jetzt niemand
mehr braucht:

- `/home/georg/uploadthing` und `/usr/local/etc/rc.d/uploadthing` löschen
  (Dienst ist gestoppt, `uploadthing_enable=NO`).
- `/root/examsense`, `/root/bin`, `/usr/local/sbin/exammode.sh`,
  die `scan-*.py`-Skripte, `actions_scan.conf`/`actions_exampy.conf`,
  `nmap_cron.sh` und den Cronjob `scan scan` entfernen.
- MikroTik: `service-monitor` löschen (der neue User `uploadthing` mit
  Gruppe `monitoring-rest` existiert, Zugriff auf `.2`/`.82` beschränkt).
- `appliance/bin/`, `appliance/files/`, `appliance/current/root/examsense/`
  und das GitHub-Repo `georgernstgraf/examsense` löschen.
- Achtung: `/home/georg/uploadthing.db` (veraltet, Mar 2026) und
  `/home/georg/uploadthing/uploadthing.db` (echte Prod-DB) liegen auf der
  Sense — vor dem Löschen entscheiden, ob letztere als Notkopie bleibt.

## Danach

- **#149 (Ops-Rest):** eigener API-Benutzer statt Root-Key, `/root` auf 750,
  #136 schließen, Zertifikats-Checkliste durchgehen.
- **#148:** `config.xml` gpg-verschlüsselt ins Repo
  (Key `19BA B05B F4D9 B55D 4907 1A9D EC23 CFDF DDA5 30BD`), Restore-Probe.
- **#135:** Playwright-Smoke-Suite, zuletzt.
- **Handy-Abnahme:** im Prüfungs-WLAN `doku` scharf schalten →
  `example.com` scheitert, `learn.microsoft.com` geht; danach wieder aus.

## API-Zugang zur Sense (Ist-Stand)

- API-Key: `~/sense.internal_root_apikey.txt` (Modus 600), Werte nur in der
  Produktions-`.env`.
- Regel `doku`: UUID `69c0079a-7b83-4cc2-95b5-78183f4b222b`, deaktiviert
  (Internet frei). Position, `toggleRule` und `apply` sind verifiziert;
  der Handy-Test im Prüfungs-WLAN steht noch aus.
- TLS: GUI-Zertifikat `CN=sense.internal` (SAN inkl. IP), interne CA unter
  `~/certs/sense-ca.pem`, `DENO_CERT` zeigt darauf.
- `GET /api/firewall/filter/getRule/{uuid}` antwortet auf 26.7 immer `[]`;
  gelesen wird über `searchRule`.

## Offene Punkte außerhalb der Tickets

- Nichts Blockierendes.
- Der Dell hostet die Sense als VirtualBox-VM (`sense-zvol-georg`); Sense und
  Tik sind nur zu Prüfungs-/Wartungszeiten online. „Daten seit Tagen alt" ist
  deshalb normal, kein Vorfall.

## #133 — was beim Deployment zu beachten ist

- Prisma ist weg: `deno.json` hat keine `pv/pg/pmd/pmD/pms/pmr/ps`-Tasks mehr,
  `prisma/` und `lib/prismaclient/` sind gelöscht. Schema-Änderungen laufen
  über `drizzle/schema.ts` + `deno task db:generate` (nur Dev-Rechner).
- Die Migrationen laufen beim App-Start (`lib/migrate.ts`).
- **Korrektur (2026-10-30):** Die Produktions-DB liegt in
  `/home/georg/uploadthing/uploadthing.db` (relativ zu `prisma/`), **nicht**
  in `/home/georg/uploadthing.db` — letztere ist ein veralteter Rest vom
  März 2026. Die echte DB hatte alle Tabellen, `examstate` und alle
  Composite-Indizes; beim Umzug wurden nur `ipfact.mac` und `adminmac`
  ergänzt (Baseline erkannt, zwei Migrationen angewendet).
- `_prisma_migrations` bleibt als Alt-Tabelle liegen; sie wird von niemandem
  gelesen.
- Der Prisma-6-Pin ist erledigt, nicht verschoben: es gibt keine Engines mehr.

## Kontext, der leicht verloren geht

- Die App läuft **auf dem Dell**, gebunden auf `192.168.21.2:443`; die Sense
  macht nur noch Firewall/DNS/DHCP. Der Dell hängt default-route-mäßig am
  grauen Kabel, das gelbe Interface trägt das Prüfungsnetz.
- Ob die Sperre greift, lässt sich nur von einem Client im Prüfungs-WLAN
  prüfen (Handy).
- Die IP-Erfassung war seit 2026-10-23 defekt (Dateimodus 644 + fehlende
  Passwortdatei) — ist durch #145 ersetzt, nicht repariert.
- Der Dell hat **nur** `192.168.21.1` als DNS; ist die Sense aus, ist der
  Dell offline, was Namensauflösung betrifft.
