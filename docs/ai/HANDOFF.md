Last updated: 2026-10-30 (#134 umgesetzt — Admin-Upload für Unterlagen).

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
- Nach dem Deployment der Sense-Version gilt weiterhin: vorher DB-Backup
  (#148). An dieser Stelle keine Schemaänderung — nur Verhalten und UI.

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
- Vor dem ersten Start der neuen Version auf der Sense weiterhin ein
  DB-Backup ziehen (#148); die Migration legt nur eine Tabelle an.

## #145 — Tik-Polling (erledigt)

- `service/tik.ts` pollt `registration-table` beim Start und alle 60 s,
  speichert IP + MAC in `ipfact` und hält den Abrufzustand für das
  Admin-Panel. `POST /activeips`, `ACTIVEIPS_ALLOWED_IPS`,
  `routes/machine.ts` und `service/ipfact.ts` sind entfernt.
- Migration `0001_ipfact_mac` (`ALTER TABLE ipfact ADD mac text`), läuft
  beim App-Start. Auf der Sense gilt weiter: vor dem ersten Start der
  neuen Version ein DB-Backup ziehen (#148).
- Für den Produktivbetrieb müssen `TIK_URL`, `TIK_USER`, `TIK_PASSWORD` in
  die Produktions-`.env`; ohne sie startet die App (Polling aus, Panel
  „nicht konfiguriert"), erfasst aber keine IPs.
- Darauf aufbauend ist #147 (MAC-basierte Admin-Freigabe) umgesetzt.

## Sofort weiter mit

**#143 — Umzug der App auf den Dell (systemd).** Voraussetzung ist erfüllt:
die Exam-Sperre läuft über die OPNsense-API, `EXAMMODE_COMMAND`,
`INTERNET_ACTIVE`, `exammode.sh` und der Subprozess-Pfad sind aus der App
verschwunden.

- **Regel `doku` neu angelegt (2026-10-30):** UUID
  `69c0079a-7b83-4cc2-95b5-78183f4b222b` (`descr=doku`, `action=reject`,
  LAN → alles außer Alias `DOKU`, erste Regel der LAN-Gruppe). Der
  26.7-Migrationsschritt hatte die Legacy-`<filter>`-Regel
  `e3e720e6-…` nicht übernommen. Anlegen, Position, `toggleRule` in beide
  Richtungen und `apply` sind verifiziert; die Regel ist **deaktiviert**
  (Internet frei). Den Handy-Test im Prüfungs-WLAN macht Georg.
- **TLS gelöst:** Web-GUI-Zertifikat jetzt `CN=sense.internal`
  (`SAN DNS:sense.internal, IP:192.168.21.1`), signiert von der internen
  CA „uploadthing internal CA". CA liegt als `~/certs/sense-ca.pem` auf
  dem Dell; Deno braucht `DENO_CERT` darauf. `OPNSENSE_API_URL` ist
  `https://sense.internal:8443` — verifizierter `fetch` gegen die echte
  Sense getestet.
- **`GET getRule/{uuid}` antwortet auf 26.7 immer `[]`** (auch für
  existierende Regeln) und ist als Lesequelle unbrauchbar; gelesen wird
  über `POST /api/firewall/filter/searchRule`.
- API-Key: `~/sense.internal_root_apikey.txt` (`key=`, `secret=`, jetzt
  Modus 600). Werte nur in die Produktions-`.env`, nie ins Repo.

## Offene Punkte außerhalb der Tickets

- Nichts Blockierendes.
- Der Dell hostet die Sense als VirtualBox-VM (`sense-zvol-georg`); Sense und
  Tik sind nur zu Prüfungs-/Wartungszeiten online. „Daten seit Tagen alt" ist
  deshalb normal, kein Vorfall.

## #133 — was beim Deployment zu beachten ist

- Prisma ist weg: `deno.json` hat keine `pv/pg/pmd/pmD/pms/pmr/ps`-Tasks mehr,
  `prisma/` und `lib/prismaclient/` sind gelöscht. Schema-Änderungen laufen
  über `drizzle/schema.ts` + `deno task db:generate` (nur Dev-Rechner).
- Die Migrationen laufen beim App-Start (`lib/migrate.ts`). Auf der Sense
  steht die DB noch bei Prisma-Migration `20260307191214` (kein `examstate`,
  keine Composite-Indizes); der erste Start der neuen Version gleicht das
  automatisch an — vorher ein DB-Backup ziehen (#148 ist noch offen).
- `_prisma_migrations` bleibt als Alt-Tabelle liegen; sie wird von niemandem
  gelesen.
- Der Prisma-6-Pin ist erledigt, nicht verschoben: es gibt keine Engines mehr.

## Kontext, der leicht verloren geht

- Die App läuft aktuell **in** der VM auf `127.0.0.1:8000`, erreichbar über
  DNAT 443→8000; das Ziel ist der Umzug auf den Dell (#143).
- Der Dell ist nicht hinter der Firewall (Default-Route über das graue Kabel).
  Ob die Sperre greift, lässt sich nur von einem Client im Prüfungs-WLAN
  prüfen (Handy).
- Die IP-Erfassung war seit 2026-10-23 defekt (Dateimodus 644 + fehlende
  Passwortdatei) — wird durch #145 ersetzt, nicht repariert.
