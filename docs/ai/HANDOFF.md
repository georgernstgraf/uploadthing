Last updated: 2026-10-31 (Admin-Dashboard #157 — alle Tests grün).

## Sofort weiter mit

Nichts Blockierendes. Die nächsten Punkte sind **Abnahmen**, keine
Umbauten — in dieser Reihenfolge:

1. **Handy-Test der Sperre** im Prüfungs-WLAN: Regel `doku` scharf
   schalten → `example.com` scheitert, `learn.microsoft.com` geht →
   wieder aus. Nur von einem Client im Prüfungsnetz prüfbar, nicht vom
   Dell.
2. **Lehrer-Login vom Dell** einmal mit echten LDAP-Daten bestätigen
   (`ADMIN_IPS` enthält `192.168.21.2`).
3. **Zertifikat erneuern** bis 2027-01-12 (Erinnerung Dezember);
   Checkliste in `OPERATIONS.md`, Abschnitt „Zertifikats-Checkliste".

## Offene Entscheidungen

- **Anonyme Namenssuche.** `/ldap` liefert ohne Anmeldung Namen und Klasse
  ab drei Zeichen — gewollt für die Anmeldung (#146), aber damit
  aufzählbar. Optionen in `DECISIONS.md` („Offen — anonyme Namenssuche").
- **Restore-Probe auf einer Wegwerf-VM.** Die XML-Ebene ist geprüft
  (Chiffrat entschlüsselt, byte-identisch zur Live-Config, alle Regeln
  und Benutzer enthalten). Das Rückspielen in eine laufende OPNsense
  fehlt. Checkliste in `OPERATIONS.md`; erster Start **nur** mit
  „Not attached", sonst kollidiert `192.168.21.1` mit der produktiven
  Sense.
- **GPG-Key ohne Passphrase.** Entschlüsseln der Backups läuft ohne
  Rückfrage. Eine Passphrase würde bedeuten, dass ein Restore nicht mehr
  unbeaufsichtigt möglich ist. Entscheidung steht aus, Risiko ist in
  `OPERATIONS.md` notiert.

## Was in dieser Session passiert ist

- **#157:** `/admin/application` ist ein Gruppendashboard: drei thematische
  Gruppen (Prüfung / Unterlagen / Zugang & System) als
  `col-12 col-lg-6 col-xxl-4`, also drei Spalten ab `xxl`, zwei ab `lg`.
  Rausgeflogen sind der äußere Riesen-Card, die `col-xl-8`-Zentrierung der
  Formulare, alle `*-lg`-Controls, sechs leere Flex-Wrapper um einzelne
  Überschriften und die Tabellen (jetzt `list-group`). Die Erfolgsmeldung
  steht über dem Raster. Der Zeitfilter auf `/admin/students` ist eine
  Zeile statt eines ~300-px-Blocks; Ids, Feldnamen und Alpine-Logik sind
  unverändert. Abnahme: E2E-Test misst die Spaltengeometrie (1600 px drei,
  1000 px zwei), Endpoint-Test prüft Gruppen-/Karten-Ids und die Position
  der Erfolgsmeldung. 352 Deno-Tests, 9 E2E-Tests, `check`/`lint` grün.

- **#156:** Der Signalhandler beendet den Prozess jetzt selbst
  (`lib/shutdown.ts`): Polling stoppen → HTTP auslaufen → SQLite
  schließen → `Deno.exit(0)`, Watchdog 10 s, zweites Signal = sofort.
  Gemessen unter 0,1 s statt 20 s; kein SIGKILL mehr im Journal.
- **#155:** Der Hero im Kopf ist ein Link auf `/`. `/whoami` war für
  Schüler eine Sackgasse — keine Navigation (`nav.hbs` rendert nur für
  Admins), Anmeldesperre im Examen, also nur noch Browser-URL-Editieren.
  Boost-Swaps scrollen wieder nach oben (`window.scrollTo`; das alte
  `#app-main.scrollTo` war seit #154 tot). Abnahme: Endpoint-Tests auf
  `/` und `/whoami`, E2E-Upload-Flow um Badge → `/whoami` → Hero
  erweitert. 347 Deno-Tests, 8 E2E-Tests, `check`/`lint` grün.
- Epic #141 (Exam-Infrastruktur 2026/27) abgeschlossen: #133, #134,
  #142–#149, #135 sowie die im Code-Review gefundenen #151–#154 sind zu.
  #150 (htmx-4-Migration) wurde aus dem Epic gelöst und bleibt für
  Februar 2027 liegen.
- **Verhalten geändert (bitte nicht zurückdrehen):** kein „Abmelden" und
  kein `/logout` mehr — die Sitzung ist langlebig, der Namenswechsel läuft
  über die Karte „Angemeldet als … · Ändern" (`/whoami`), die jetzt alle
  Angemeldeten sehen. Das Scroll-Layout ist normales Dokument-Scrolling
  mit sticky Kopf (eine Scrollfläche, keine Höhen-Offsets). Beides steht
  in `docs/ai/DECISIONS.md`.
- **#144** auf der Sense durchgezogen: Cronjob `scan scan` per API
  (`/api/cron/settings/delJob`, dann `configctl cron restart`),
  `/root/examsense`, `/root/bin`, `/usr/local/sbin/exammode.sh`,
  `actions_scan.conf`, `actions_exampy.conf`, `nmap_cron.sh`,
  `rc.d/uploadthing`, `/home/georg/uploadthing` und die veraltete
  `uploadthing.db` gelöscht; configd neu gestartet. `find` über `/root`,
  `/usr/local`, `/home/georg` findet keine Reste.
- **Sicherungen vor der Löschung** liegen in `~/uploadthing-archive/`
  (Modus 700): `examsense-2026-10-30.bundle` (Git-Historie, HEAD
  `9583565`), `examsense-2026-10-30.tar.gz` (Checkout) und
  `legacy-uploadthing-2026-10-30.tar.gz` (altes App-Verzeichnis inkl.
  DB und `.env` der Sense).
- **MikroTik:** `service-monitor` entfernt, `uploadthing` strikt auf
  `192.168.21.2/32`. SSH als `admin` auf `tik` funktioniert
  schlüsselbasiert.
- **GitHub:** `georgernstgraf/examsense` entarchiviert und gelöscht.
- **#149:** Benutzer `uploadthing-api` (uid 2000, Scope `user`,
  Shell `nologin`, einziges Privileg `page-filter-api`) angelegt, Key in
  die Produktions-`.env`, Dienst neu gestartet und im Log verifiziert.
  `/root` auf 750. Der Root-Key bleibt nur für den Menschen.
- **#148:** `scripts/backup-config.sh`, Chiffrat
  `appliance/backups/config-2026-10-30.xml.gpg` + `MANIFEST`. Die
  Redaktion deckte `<apikeys>` und `<user_apitoken>` **nicht** ab — die
  Key-Hälften lagen im öffentlichen `config.redacted.xml`. Filter
  erweitert, Snapshot neu erzeugt.
- **#135:** `deno task e2e` mit sechs Browser-Tests (Chromium, eigene
  Wegwerf-DB, Port 8099). Dabei ein echter Defekt gefunden und in #151
  behoben: `hx-disabled-elt="this"` wirkt nicht, wenn `hx-post` am
  `<form>` hängt.

## Kontext, der leicht verloren geht

- Die App läuft **auf dem Dell**, gebunden auf `192.168.21.2:443`; die
  Sense macht nur noch Firewall/DNS/DHCP. Der Dell hängt
  default-route-mäßig am grauen Kabel, das gelbe Interface trägt das
  Prüfungsnetz.
- **Sense ist ein VirtualBox-Gast auf dem Dell** (`sense-zvol-georg`).
  Sie läuft nur zu Prüfungs-/Wartungszeiten; „Daten seit Tagen alt" ist
  normal, kein Vorfall. `VBoxManage list runningvms` zeigt den Zustand.
- **DNS:** Unbound beantwortet Port 53, dnsmasq nur DHCP (Port 67).
  dnsmasq-Einträge mit `hwaddr` sind DHCP-Reservierungen — der
  `dell`-Eintrag trägt deshalb die USB-MAC (`7c:c2:c6:15:cb:a8`).
- **TLS:** Zertifikat in `~/certs/tst.spengergasse.at/`; Deno liest es
  nur beim Start, also nach jeder Kopie `systemctl --user restart`.
- **API-Zugang:** App-Key in der Produktions-`.env`; Root-Key in
  `~/sense.internal_root_apikey.txt` (600). API-Aufrufe gegen
  `https://sense.internal` brauchen `DENO_CERT` bzw. `-k` auf der
  Kommandozeile.
- **`GET /api/firewall/filter/getRule/{uuid}`** antwortet auf 26.7
  immer `[]`; gelesen wird über `POST …/searchRule`.
- **OPNsense-API-Falle:** `CSVListField`-Felder (z. B. `priv` bei
  `auth/user/set`) wollen einen Komma-**String**, kein JSON-Array — sonst
  kommt nur „Unexpected error" ohne Log.
- **`scripts/test-with-server.sh`** killt alles auf Port 8000, auch einen
  fremden Dev-Server.
- Der Dell hat **nur** `192.168.21.1` als DNS; ist die Sense aus, ist der
  Dell offline, was Namensauflösung betrifft.

## Nach dem Epic

- **#150** htmx-4-Migration (Februar 2027) — die E2E-Suite ist die
  Abnahme dafür.
- Runtime-Frage nach der Saison 2026/27 (Deno-Deprecation).
