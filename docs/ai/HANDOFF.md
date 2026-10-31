Last updated: 2026-10-31 (#161 Phase 1 — Anmelde-Freigabe als Schalter, alle Tests grün).

## Sofort weiter mit

**#161 Phase 1 ist fertig.** Offen sind die Phasen 2–6 aus dem Issue:

1. **Phase 2 — Cookie-Dedupe** (`cookiepresents` höchstens eine Zeile pro
   IP+User je 30 s, kein Event für Lehrpersonen). Voraussetzung dafür,
   dass der Admin-Kanal in Phase 5 keine Rückkopplung erzeugt.
2. **Phase 3 — SSE-Grundlage**: `lib/event_hub.ts`, `lib/sse.ts`,
   `service/events.ts`, `closeAllStreams()` als erster Schritt in
   `stopBackgroundWork` (sonst hängt der Shutdown an offenen Streams).
3. **Phase 4 — Exam-Kanal**, Hover-Trigger aus `abgabe.hbs` raus.
4. **Phase 5 — Admin-Kanal**, `every 15s` raus, Freeze-Badge.
5. **Phase 6 — Doku**: SSE-Regeln in `CONVENTIONS`, `ADMIN_REFRESH_SECONDS`
   aus README/`.env.example` entfernen; die Schalter-Doku ist bereits
   geschrieben.

Nebenbefund: Der E2E-Test „Geschlossene Abgabe-Karte prüft bei Hover und
Klick (#160)" ist einmalig geflackt (`mouseenter`- und `click`-Request
rennen um denselben Swap). Phase 4 entfernt den Mechanismus ohnehin;
bis dahin bei Rot einmal wiederholen.

## Betriebliche Abnahmen (unverändert)

1. **Security-Header im Betrieb prüfen:** Dienst neu starten
   (`systemctl --user restart uploadthing`, Deno liest nur beim Start),
   dann `curl -sSI https://tst.spengergasse.at/ | grep -i content-security`
   → `upgrade-insecure-requests`. Danach beim Schüler-Gerät prüfen, ob
   das „Not secure"-Badge nach einem Hard Reload (Strg+Shift+R)
   verschwunden ist; eine bereits gecachte Seite hat den Header nicht.
2. **Handy-Test der Sperre** im Prüfungs-WLAN: Regel `doku` scharf
   schalten → `example.com` scheitert, `learn.microsoft.com` geht →
   wieder aus. Nur von einem Client im Prüfungsnetz prüfbar, nicht vom
   Dell.
3. **Lehrer-Login vom Dell** einmal mit echten LDAP-Daten bestätigen
   (`ADMIN_IPS` enthält `192.168.21.2`).
4. **Zertifikat erneuern** bis 2027-01-12 (Erinnerung Dezember);
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

- **Security-Header gegen das „Not secure"-Badge.** Chrome zeigte bei
  `tst.spengergasse.at` trotz gültigem Let's-Encrypt-Zertifikat
  (14.10.2026–12.01.2027, TLS 1.3, HTTP/2) und leerem DevTools-Panel
  „Not secure" mit „Certificate is valid" im Bubble — der Chrome-State
  `WARNING`, also **Mixed Content** oder ein Formular mit `http://`-Ziel.
  Die Instanz liefert nachweislich keine `http://`-Referenz aus (HTML,
  `theme.css`, `ui-shell.css`, `ibm-plex-sans.css`, Templates; Port 80
  zu, keine iframes/CDNs), der per CDP ausgelesene
  `Security.visibleSecurityStateChanged` meldet `secure`. Der Auslöser
  saß also im Client (alter Cache vor dem Umzug auf den Dell, Extension
  oder Proxy). Neu: `middleware/security_headers.ts` setzt auf **jeder**
  Antwort `Content-Security-Policy: upgrade-insecure-requests` und hebt
  damit eingeschleuste http-Ressourcen auf https. **Bewusst kein HSTS**
  (Begründung in `CONVENTIONS.md`: kein http-Dienst, aber die
  „Trotzdem fortfahren"-Notbremse muss wegen der manuellen
  Zertifikatserneuerung bleiben). Vier Tests in
  `middleware/security_headers_test.ts` plus eine Endpoint-Zeile;
  360 Deno-Tests, `check`/`lint` grün.

- **#160:** Das Abgabe-Panel wertete `exam_open` einmal beim Rendern aus —
  wer die Seite vor dem Exam-Start geladen hatte, sah dauerhaft nur den
  Hinweis und musste neu laden. Die geschlossene Karte prüft jetzt bei
  Hover **und** Klick gegen den neuen Fragment-Endpunkt `GET /abgabe-panel`
  (nur `buildPanel`) und tauscht sich gegen das Formular. `throttle:3s`
  verhindert die Request-Schleife (der Swap ersetzt den Knoten unter dem
  Cursor), `click` ist der Touch-/Tastaturweg; die Trigger-Attribute
  existieren nur im geschlossenen Zweig, damit bei offenem Formular keine
  gewählte Datei verloren geht. Endet das Examen bei offenem Formular,
  bleibt `POST /upload` bei 403 und `htmx:responseError` holt das Panel neu.
  Dabei fiel auf, dass `Alpine.initTree` im afterSwap-Handler nur
  `#app-content` initialisierte — Countdown und Dateiname standen nach
  jedem Panel-Swap still; jetzt auch für `#abgabe-panel`. Im selben Zug
  Alpine 3.15.12 → 3.17.5 (htmx bleibt 2.0.10, letzte 2.x). 355
  Deno-Tests, 12 E2E-Tests, `check`/`lint` grün. Issue #160 ist
  geschlossen.
- Der Anomalie-Test auf `/admin/students` scheiterte reproduzierbar
  außerhalb der Schulzeit (die Route rastet den Zeitraum auf `spg_times`
  ein, das Fenster liegt dann in der Zukunft); er gibt den Zeitraum jetzt
  explizit mit. Siehe `PITFALLS.md`.

- **#158:** Kopf und erste Zeile darunter hatten 0 px Abstand —
  Navigation und Namenskarte klebten an der Hero-Karte (gemessen bei
  390 und 1280 px). Jetzt `body > header { padding-bottom: 0.5rem }`.
  Im Handy-Portrait bricht der Kopf nicht mehr in drei Zeilen
  (unsichtbarer Platzhalter / h1 / Schalter), sondern umbricht selbst:
  `flex-wrap-reverse` schiebt den Schalter über den Hero, sobald der
  Titel nicht mehr daneben passt; der Platzhalter-Button ist entfallen.
  Der Kopf schrumpft von 124 auf 85 px. Der Kopf nutzt
  außerdem `container px-2` wie `<main>` und fluchtet dadurch bei
  1280 px (1124 px statt 1264 px). Elf UI-Stellen siezten noch
  (Toasts, `hx-confirm`, 4xx) und duzen jetzt; `test/ui_copy_test.ts`
  verbietet formelle Anrede in Templates und Routen-Meldungen.
  Abnahme: E2E misst Abstände, Schalterposition und Kantenflucht;
  354 Deno-Tests, 10 E2E-Tests, `check`/`lint` grün.

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
