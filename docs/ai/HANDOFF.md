Last updated: 2026-10-31 (#161 Phasen 2–6 committet, Deploy steht aus; #162 erledigt; Sichtprüfung Phase 1 offen).

## Sofort weiter mit

**Der Deploy fehlt.** Der Code der Phasen 2–6 (Cookie-Dedupe, SSE-Grundlage,
Exam-Kanal, Admin-Kanal, Doku) ist committet und getestet, läuft aber noch
nicht auf dem Dienst. Der Reihe nach:

1. `systemctl --user restart uploadthing` — danach
   `systemctl --user status uploadthing` (kein `stop-sigterm`) und
   `journalctl --user -u uploadthing -n 20` (keine
   „Ereignis-Listener … gescheitert", kein Watchdog-Fehler).
2. `curl -sSI https://tst.spengergasse.at/` → 200 und die
   `content-security-policy`-Zeile.
3. **Der h2-Beweis, den die Tests nicht führen:** mit dem Cookie einer
   angemeldeten Sitzung (DevTools → Network → Request-Header `Cookie:`,
   Standardname `ut_session`)

   ```
   curl -N --http2 -b "ut_session=<wert>" https://tst.spengergasse.at/events/exam
   ```

   muss sofort der erste Frame kommen (`event: exam` + `data: {...}` mit
   `server_now_ms`, `ends_at_ms`, `open`), danach spätestens alle 20 s
   `: ping`. Kommt nichts, sind `Connection`/`Transfer-Encoding` im Spiel
   (über HTTP/2 verboten, siehe `PITFALLS.md`). Analog einmal
   `https://tst.spengergasse.at/admin/events` mit einem Lehrer-Cookie
   (erster `event: activity`-Frame) und ohne Sitzung ein 401 auf
   `/events/exam`.
4. **Danach die Sichtprüfung aus Phase 1**, die seit dem Deploy offen ist:
   `/admin/application` → Examen starten → die Karte „Anmeldung während
   des Examens" ist da; Schalter an → `#exam-warning-registration` mit
   „Seit HH:MM"; Schalter aus → Balken weg. Stopp und Internet-Schalter
   fragen nicht mehr nach. Neu zu sehen: Das Admin-Panel zieht den Zustand
   ohne Klick nach, das Abgabe-Panel wechselt beim Exam-Start/-Ende von
   selbst, und auf `/admin/students` steht „Stand HH:MM:SS" mit dem
   Ereignis-Zähler; ein offenes Detail friert den Refresh ein und zählt
   mit.

**#162 ist erledigt** (Server-Antwort ≠ Ausfall, ein begrenzter
Transport-Retry, injizierbarer Searcher). Die betrieblichen Abnahmen unten
bleiben unverändert offen.

Nebenbefund, erledigt: Der E2E-Test „Geschlossene Abgabe-Karte prüft bei
Hover und Klick (#160)" ist mit dem Trigger entfallen; an seine Stelle
treten die Push-Tests (Exam-Start/-Ende ohne Interaktion, Admin-Panel ohne
Klick, Badge ohne Reload, offenes Detail friert ein).

## Betriebliche Abnahmen (unverändert)

1. **Security-Header im Betrieb prüfen:** Der Header ist am 31.10. nach
   dem Neustart per `curl -sSI https://tst.spengergasse.at/` bestätigt
   (`upgrade-insecure-requests`). Offen ist nur der Blick am
   Schüler-Gerät, ob das „Not secure"-Badge nach einem Hard Reload
   (Strg+Shift+R) verschwunden ist; eine bereits gecachte Seite hat den
   Header nicht.
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

- **#161 Phasen 2–6: Server-Push statt Polling (SSE).** Vier Commits
  (`718ffca`, `2a08d97`, `6f04b50`, `2dc12a0`): (1) Presence-Zeilen
  dedupliziert (`COOKIE_PRESENT_MIN_INTERVAL_MS = 30_000`, `recordByEmail`
  meldet den echten Insert) und `/static/*` von der Presence ausgenommen;
  (2) `lib/event_hub.ts` (zwei Kanäle `exam`/`activity`, Seq-Zähler, kein
  Event-Log), `lib/sse.ts` (eigener `Response` — `streamSSE` setzt
  `Connection`/`Transfer-Encoding`, über HTTP/2 verboten; Heartbeat
  `: ping` alle 20 s unref'd; `closeAllStreams()`), `service/events.ts`
  (Snapshots, 1-s-Koaleszierung) und `closeAllStreams()` +
  `exam_watchdog.disarm()` als erste Schritte im Shutdown; (3) Exam-Kanal
  `GET /events/exam` mit Watchdog für den pünktlichen Abschluss und
  `ends_at_ms` aus der exakten Restzeit, Client `static/events.js`
  übernimmt Countdown (Serveruhr-Offset) und Panel-Swap; (4) Admin-Kanal
  `GET /admin/events` statt `every 15s`, `hx-trigger="admin-refresh"`,
  Freeze-Badge `#admin-refresh-pending` und „Stand HH:MM:SS".
  `ADMIN_REFRESH_SECONDS` ist aus `lib/config.ts`, `README.md` und
  `.env.example` entfernt. Abnahme: 407 Deno-Tests, 17 E2E-Tests,
  `check`/`lint` grün.
- **#162: LDAP — Server-Antwort vom Transportfehler trennen.**
  `repo/ldapuser.ts` wirft `LdapServerResponseError` (numerischer
  Result-Code aus ldapts' `ResultCodeError`) bzw. `LdapTransportError`,
  erlaubt genau **einen** Neuversuch nur bei Transportfehlern und baut den
  Client mit 5-s-Frist auf; die `while (true)`-Schleife ist weg.
  `service/ldapuser.searchFailureMessage()` meldet „am Server gescheitert
  (LDAP-Code 0x…)" statt pauschal „nicht erreichbar";
  `searchLoginCandidates(term, searcher)` macht den Fehlerzweig ohne
  echtes Verzeichnis testbar. Commit `2233956`.
- **#161 Phase 1: Anmelde-Freigabe als Schalter.** Das 5-Minuten-Fenster
  aus #146 ist ersetzt: `registrationAllowed` + `registrationOpenedAt` in
  `service/exam.ts`, Reset nur in `start()` und `finishExam()`, `pause()`
  unberührt. Neuer Endpunkt `POST /api/exam/registration` (Spiegel von
  `/api/exammode`), Antwort ist das ganze `#exam-admin-panel`. Der
  Warnbalken `#exam-warning` hat jetzt zwei Zeilen
  (`#exam-warning-internet`, `#exam-warning-registration` mit
  „freigegeben seit"), berechnet in `buildExamHazards()`;
  `buildExamPanelData()` ersetzt die doppelte Panel-Konstruktion aus
  `routes/admin.ts` und `routes/api.ts`. Drei `hx-confirm` entfernt
  (Stopp ×2, Internet-Schalter), die fünf Datenlösch-Rückfragen bleiben.
  Entfernt: `POST /api/exam/registration-window`,
  `buildRegistrationWindowPanel()`, `templates/admin-registration-window.hbs`,
  der Wrapper in `home.hbs`, `registration_window_html`. Commit `dde6330`;
  366 Deno-Tests, 13 E2E-Tests (damaliger Stand), `check`/`lint` grün.
- **LDAP-Aussetzer → #162.** Ein Request der Namenssuche scheiterte um
  12:05:01 mit `NO_OBJECT` (AD-Antwort, kein Netzausfall), die App zeigte
  „nicht erreichbar"; derselbe Prozess band sofort neu, danach lief alles.
  Ursache im Code: Hintergrund-Reconnect + pauschale Fehlermeldung; kein
  Test für den Fehlerzweig. Behoben in `2233956` (siehe oben).
- **`AGENTS.md`: Restart-Pflicht.** Neue Sektion „Restart After Code
  Changes" — nach Änderungen an `main.ts`, `lib/`, `middleware/`,
  `routes/`, `repo/`, `service/`, `templates/` oder `.env` muss
  `systemctl --user restart uploadthing` laufen.

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
  Hinweis und musste neu laden. Die geschlossene Karte prüfte damals bei
  Hover **und** Klick gegen den neuen Fragment-Endpunkt `GET /abgabe-panel`
  (nur `buildPanel`) und tauschte sich gegen das Formular; **seit #161
  entfällt der Trigger**, den Wechsel schiebt SSE, der Fragment-Endpunkt
  bleibt. `throttle:3s`
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
