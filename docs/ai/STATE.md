# Project State

Current status as of 2026-11-01.

## Current Focus

**#165 — Prüfungssperre blockierte DNS und Infrastruktur — erledigt am
2026-11-01, Issue geschlossen.**
Unbound auf der Sense war nie defekt; die Regel `doku` stand mit
`sequence 100` vor „LAN → (self)" und „LAN → INFRA" und hat damit auch
Port 53 verworfen (`reject` → RST, in `dig` als „connection refused").
Sie steht jetzt auf `sequence 550`: DNS zur Sense, GUI/SSH und der
`INFRA`-Satz (Connectivity-Checks, NTP) sind immer erreichbar, gesperrt
bleibt nur das freie Internet. Im INFRA-Alias war `www.thinkdifferent.us`
mit `ipv6.msftconnecttest.com` verklebt — getrennt. Verifiziert bei
**eingeschalteter** Sperre: `tst.spengergasse.at → 192.168.21.2`,
`sense.internal → 192.168.21.1`, `1.1.1.1` blockiert, `INFRA`-Host
erreichbar. Config-Backup `appliance/backups/config-2026-11-01.xml.gpg`
liegt vor.

**#164 — Forensikkarte, WLAN-Sperre, Unterlagen-Push — deployt am
2026-11-01 (11:40:18), Issue geschlossen, Sichtprüfung offen.**
Vier Fehlerbilder aus dem laufenden Examen, alle datengetrieben statt per
Zeit-Heuristik gelöst:

- **Präsenz ist das Ereignis.** Jede neue Schüler-Präsenz publiziert
  `cards` (nicht mehr nur der Identitätswechsel) — ein „Unbekannt"-Kärtchen
  wird zum Namenskärtchen, auch wenn die IP gestern schon dieselbe Person
  trug. Lehrpersonen sind ausgenommen (ihr eigener Panel-Request schreibt
  eine Presence-Zeile — sonst rendert das Panel sich selbst), ebenso die
  Presence-Zeile von `POST /upload` (die Abgabe meldet sich über
  `card-<slug>`).
- **WLAN-Sperre nur im laufenden Examen.** `canResubmit()` bekommt den
  Exam-Start; eine Abgabe von vorher (etwa Mai) sperrt nichts mehr. Ohne
  Exam-Zustand entscheidet die Sperre gar nicht.
- **Unterlagen-Push.** `UNTERLAGEN_CHANNEL`, `event: unterlagen` auf der
  bestehenden `/events/exam`-Verbindung, neues Fragment
  `GET /angaben-panel` und `templates/angaben.hbs`; `static/events.js`
  tauscht nur die Karte (`outerHTML`), mit In-Flight-Schutz und einem
  Nachholen nach Reconnect.
- **Knopf „Seit Exam-Start"** im Zeitfilter von `/admin/students`:
  serverseitig mit `started_at` gerendert, `disabled` ohne laufendes oder
  pausiertes Examen. Das Einrasten auf `spg_times` bleibt unverändert —
  es gibt weder `ADMIN_DEFAULT_WINDOW_MS` noch eine Lücken-Heuristik.
- Verifikation: `check`/`lint` grün, **462 Deno-Tests, 24 E2E-Tests**.
- **Deploy durch (11:40:18)**, Neustart unter 1 s, Journal ohne
  Watchdog-/Listener-Fehler, `Listening on https://192.168.21.2:443/`.
  Live bestätigt: `GET /angaben-panel` = 200 mit `#angaben-panel` (ohne
  Abgabe-Panel), Startseite trägt beide Angaben-Ids, `/admin/students`
  für Lehrpersonen 200, für Anonyme 403, `/events/exam` 401 ohne Sitzung,
  über HTTP/2 `content-type: text/event-stream; charset=utf-8`,
  `cache-control: no-store`, kein `connection`/`transfer-encoding`,
  erster Frame `event: exam`; Unterlagen-Upload über
  `POST /admin/unterlagen` → `event: unterlagen` auf derselben
  Verbindung, Löschen räumt die Karte wieder (temporäre Datei entfernt).
  Der Knopf „Seit Exam-Start" ist ohne Examen deaktiviert; der aktive
  Zustand ist im E2E-Test belegt.
- **Offen (nur mit echtem Examen prüfbar):** Panel offen lassen und eine
  Schülerin erstmals am Tag aufrufen lassen (Kärtchen mit Namen),
  Abgabe nach einer alten Abgabe (200 + Badge ≤ 1 s, kein Vollrender).
  Checkliste in `HANDOFF.md`.

**#163 — Admin-Kärtchen als Push-Komponenten — deployt am 2026-11-01
(03:28:43), Issue geschlossen, Sichtprüfung offen.**
Fünf Commits (`ccd3468`, `f04b56f`, `4fd95b0`, `b37ca4d`, `61c5b09`): Scan-Achse
`tikscan`, Registrierung als Präsenz, Komponenten-Kanal und die
Client-Verdrahtung über `htmx-ext-sse`. Der Admin-Kanal transportiert
Komponenten statt Gründen (`cards`, `card-<slug>`, `tik`), der Server
liefert benannte SSE-Frames plus `stand`, und der Browser verbindet ihn
über die vendorte `htmx-ext-sse@2.2.4`: jedes Kärtchen hängt an seinem
eigenen Ereignis, das Panel an `sse:cards`, der MikroTik-Streifen an
`sse:tik`. Der Freeze hält nur noch Panel-Swaps auf. `data-exam-events`
liegt am `<main>`, damit ein HTMX-Login den Exam-Kanal mitbringt.
Verifikation: `check`/`lint` grün, **452 Deno-Tests, 22 E2E-Tests**; der
Deploy lief mit den Migrationen `0003`/`0004` und live bestätigtem
`event: stand` über HTTP/2.
**Offen:** die Sichtprüfung aus dem Ticket (Laptop/Handy-Identitätswechsel,
stiller Dauer-Ping, ein Kärtchen bei Abgabe, „nicht anwesend" nach
fehlendem Scan, leerer Scan).

**#161 — Server-Push statt Polling (SSE) + Anmelde-Freigabe als Schalter —
erledigt am 2026-10-31, Issue geschlossen.**
Phasen 1–6 sind committet, getestet und live (Phase 1 ab 12:17, Phasen 2–6
ab 13:08): Anmelde-Freigabe als Schalter, Cookie-Dedupe, Event-Bus und
Streams, Exam-Kanal mit Watchdog, Admin-Kanal mit Freeze-Badge, Doku.
Der h2-Beweis im Betrieb ist geführt: `/events/exam` liefert über HTTP/2
sofort den ersten Frame (`event: exam`), die Antwort trägt nur
`content-type: text/event-stream; charset=utf-8` und `cache-control:
no-store`, kein `connection`/`transfer-encoding`, CSP bleibt gesetzt;
ohne Sitzung 401. `/admin/events` ist für Schüler 403; seit #163 sendet er
für Lehrpersonen `stand` plus benannte Komponenten-Frames und `: ping` nach
20 s (seit dem #163-Deploy ist `stand` im Betrieb bestätigt; `cards`,
`card-<slug>` und `tik` brauchen eine echte Aktivität). Eine
Lehrpersonen-Sitzung löst keinen Panel-Render aus (seit #164 per Rolle:
die Präsenz einer Lehrperson ist nie eine Zeile des Schüler-Panels).
Offen bleibt nur
die **Sichtprüfung der Phase 1** im Panel (Checkliste in `HANDOFF.md`).

**#162 — Namenssuche-Robustheit — erledigt am 2026-10-31.**
Server-Antworten (Result-Code) werden nicht mehr als Netzausfall gemeldet,
der Neuversuch ist auf einen begrenzten Transport-Retry reduziert, die
Suche ist per injizierbarem Searcher testbar.

**Epic #141 — Exam-Infrastruktur 2026/27 — abgeschlossen am 2026-10-31.**
Alle Sub-Issues sind zu (#133, #134, #142–#149, #135, nebst den im
Code-Review gefundenen #151–#154); #150 (htmx-4-Migration) wurde aus dem
Epic gelöst und ist ein eigenständiges Backlog-Ticket für Februar 2027.

Das System läuft so, wie es das Epic beschrieben hat:

- **Dell** = Hypervisor + App: User-Unit aus `~/repos/georgernstgraf/uploadthing`,
  Env in `~/.config/uploadthing/uploadthing.env`, Daten in
  `~/uploadthing-data/`, gebunden auf `192.168.21.2:443`,
  `tst.spengergasse.at` per Unbound dorthin.
- **Sense** = Firewall/DNS/DHCP, ohne eigene Skripte, ohne Cronjob, ohne
  `rc.d`-Eintrag; das GitHub-Repo `examsense` ist gelöscht.
- **Steuerung** ausschließlich über die OPNsense-API als eigener Benutzer
  `uploadthing-api` mit dem Privileg `page-filter-api`; der Root-Key ist
  nur noch für den Menschen.
- **IP-/MAC-Präsenz** per Tik-REST im App-Prozess (`service/tik.ts`);
  MikroTik-Konto `uploadthing`, strikt auf `192.168.21.2/32`, nur
  `monitoring-rest`.
- **Tests**: 452 Deno-Tests plus 22 Playwright-E2E-Tests in
  `deno task e2e` (Chromium, eigene Wegwerf-DB auf Port 8099).

## Erledigt am 2026-11-01 (Komponenten-Push, Scan-Achse, #163)

- **Scan-Achse `tikscan` (`ccd3468`).** Migration `0003_tikscan` legt die
  Tabelle an und füllt sie aus `DISTINCT ipfact.seen`; der Poller schreibt
  ab jetzt jeden abgeschlossenen Abruf, auch einen leeren. `is_stale`,
  `missed_count` und `canResubmit()` lesen die Scan-Achse;
  `service/ipadmin.for_range` und `for_ip` bauen die Karte über denselben
  Aggregationskern, `repo.ipfact` liefert `scansInRange`, `latestScan`,
  `previousScan`, `ipsAt` und `ipsBetween`. `ADMIN_STALE_MINUTES`
  ist aus `lib/config.ts`, `README.md` und `.env.example` entfernt; die
  Datenbankbereinigung nimmt `tikscan` mit einem Jahr Cutoff mit.
- **Registrierung ist Präsenz (`f04b56f`).** `recordPresence()` liefert
  `{inserted, identityChanged}`; `service/user.register()` schreibt
  `registrations` und `cookiepresents` mit demselben `at`.
  `cookiepresents` ist die alleinige Attributionsquelle, die
  Lehrpersonen-Ausnahme in der Session-Middleware entfällt. Migration
  `0004_backfill_cookiepresents` zieht den Altbestand nach.
- **Komponenten-Kanal (`4fd95b0`).** `noteAdminActivity(component)` mit
  `cards`, `card-<slug>`, `tik`; `scanDelta()` publiziert nur Übergänge
  zwischen zwei Scans. Neue Fragmente `GET /admin/student-card` (204 ohne
  Zeile) und `GET /admin/tik-panel`; `parseAdminRange` ist die eine
  Zeitraum-Wahrheit, Kärtchen-Partials und `ipSlug` in `lib/slug.ts`.
  Badge „nicht anwesend" (`text-bg-danger`) getrennt von „Fehlte X mal"
  (`text-bg-warning` ab 1).
- **Client-Verdrahtung (`b37ca4d`).** `htmx-ext-sse-2.2.4` vendort
  (`static/htmx-ext-sse.js` → `htmx-ext-sse-2.2.4.js`), `sse-connect` am
  Admin-Container, `sse:cards`/`sse:card-<slug>`/`sse:tik` als Trigger,
  `sse-swap="stand"` an `#admin-refresh-stand`. Der Freeze hält nur
  Panel-Swaps auf. Der Admin-`EventSource` ist aus `static/events.js`
  entfernt; `data-exam-events` liegt am `<main>`, `connect()` versucht es
  nach jedem HTMX-Login erneut. E2E 17 → 21.
- **Review-Fixes (`61c5b09`).** Der MikroTik-Streifen erbte `hx-select` des
  Panels und löschte sich beim ersten `sse:tik`-Frame selbst; die wirksame
  Sperre sitzt jetzt am `#admin-report-panel`, die Zeile am Streifen
  dokumentiert sie, ein E2E-Test fährt den Negativbeweis. „Nicht anwesend"
  erscheint auch am Unbekannt-Kärtchen, `insertScan` sitzt in `pollOnce`
  vor `register` (injizierbare `recordScan`-Naht), Inline-Größen liegen in
  `static/ui-shell.css` (`.card-avatar`), `TEACHER_CLASS` statt Literal,
  der `ipSlug`-Helper wird wirklich benutzt.
- **Abnahme:** `check`/`lint` grün, **452 Deno-Tests, 22 E2E-Tests**.
  Details in `DECISIONS.md` („Der Admin-Kanal transportiert Komponenten"),
  `CONVENTIONS.md` („Server-Sent Events") und `PITFALLS.md`. **Deploy ist
  durch (2026-11-01, 03:28:43)**, Migrationen `0003`/`0004` angewendet,
  `tikscan` mit 2592 Backfill-Zeilen; live bestätigt: `event: stand` über
  HTTP/2, nur `content-type`/`cache-control`, `/admin/student-card` 200
  bzw. 204, `/admin/tik-panel` 200. **Sichtprüfung am Gerät steht aus.**

## Erledigt am 2026-10-31 (Server-Push statt Polling, #161 Phasen 2–6)

- **Cookie-Dedupe (#161).** `service/cookiepresents.recordByEmail()` schreibt
  höchstens eine Zeile pro (IP, User) je 30 s und meldet per Rückgabewert,
  ob es ein echter Insert war; `/static/*` schreibt gar keine Presence mehr
  (rund acht Asset-Requests pro Seite), und Lehrpersonen lösen kein
  Ereignis aus (seit #164 per Rolle: ihre eigene Präsenz ist nie eine Zeile
  des Schüler-Panels, und ihr Panel-Request schreibt selbst eine Zeile).
  Ohne diese drei Riegel löst der Admin-Render den nächsten aus.
- **SSE-Grundlage (#161).** `lib/event_hub.ts` (Kanäle, Seq, Listener, kein
  Event-Log), `lib/sse.ts` (eigener `Response` statt `streamSSE`, weil
  `Connection`/`Transfer-Encoding` über HTTP/2 verboten sind; Heartbeat
  `: ping` alle 20 s, unref'd), `service/events.ts` (Snapshots,
  1-s-Koaleszierung der Admin-Aktivität). `closeAllStreams()` und
  `exam_watchdog.disarm()` sind die ersten Schritte im Shutdown — offene
  Streams sind sonst in-flight Requests.
- **Exam-Kanal (#161).** `GET /events/exam` (401 ohne Sitzung) schickt beim
  Verbinden den vollständigen Zustand; `static/events.js` tickt den
  Countdown mit dem Serveruhr-Offset aus `server_now_ms`, tauscht
  `#abgabe-panel` bei `open`-Wechsel und zieht das Admin-Panel ohne Klick
  nach. Der Hover-/Klick-Trigger aus #160 ist entfallen.
- **Pünktlicher Abschluss (#161).** `service/exam_watchdog.ts` plant auf die
  Restzeit (`SAFETY_MARGIN_MS = 250`) und stößt den bestehenden lazy Pfad
  an; `finishInFlight` in `service/exam.ts` verhindert doppelte
  `setInternetActive`-Runden, wenn Watchdog und Admin-Stopp gleichzeitig
  feuern. `ends_at_ms` wird aus der exakten Restzeit gerechnet, nicht mehr
  aus `ceil`.
- **Admin-Kanal (#161, Client seit #163 überholt).** `GET /admin/events`
  (403 für Schüler) ersetzt `every 15s`. Ursprünglich hing das Panel an
  `hx-trigger="admin-refresh"`; seit #163 hängt es an `sse:cards` und der
  Admin-Stream gehört der vendorten `htmx-ext-sse`. Offene Details,
  Accordion oder IP-Modal frieren weiterhin den **Panel-Swap** ein und
  zählen in `#admin-refresh-pending` („n neue Ereignisse");
  `#admin-refresh-stand` zeigt „Stand HH:MM:SS" aus dem `stand`-Frame.
  `ADMIN_REFRESH_SECONDS` ist aus `lib/config.ts`, `README.md` und
  `.env.example` entfernt.
- **Abnahme:** 407 Deno-Tests, 17 E2E-Tests, `check`/`lint` grün. Details in
  `DECISIONS.md` („Server-Push statt Polling"), Regeln in `CONVENTIONS.md`
  („Server-Sent Events").

## Erledigt am 2026-10-31 (Namenssuche-Robustheit, #162)

- **Server-Antwort ≠ Netzausfall.** `repo/ldapuser.ts` typisiert Fehler:
  `LdapServerResponseError` (numerischer Result-Code aus ldapts'
  `ResultCodeError`, z. B. 32 = `NO_OBJECT`) und `LdapTransportError`.
  Genau **ein** Neuversuch, nur bei Transportfehlern; Server-Antworten
  gehen sofort weiter.
- **Keine Endlosschleife mehr.** Der Client wird je Versuch mit
  `LDAP_REQUEST_TIMEOUT_MS = 5000` gebaut; ein laufender Aufbau wird von
  weiteren Aufrufern geteilt statt verdoppelt. Die frühere
  `while (true)`-Schleife mit `ldap_retry_wait_seconds` ist entfernt.
- **Ehrliche Meldung.** `service/ldapuser.searchFailureMessage()` sagt
  „am Server gescheitert (LDAP-Code 0x…)" bzw. nur bei Transportfehlern
  „nicht erreichbar".
- **Testbar ohne Verzeichnis.** `searchLoginCandidates(term, searcher)`
  nimmt einen `LdapUserSearcher` (analog zu `TikFetcher`);
  `service/ldapuser_test.ts` und `repo/ldapuser_test.ts` decken
  Server-Antwort, Transportfehler und den einen Neuversuch ab.

## Erledigt am 2026-10-31 (Anmelde-Freigabe als Schalter, #161 Phase 1)

- **5-Minuten-Fenster → Schalter.** `service/exam.ts` hält jetzt
  `registrationAllowed` + `registrationOpenedAt`; zurückgesetzt wird nur
  in `start()` und `finishExam()`. `pause()` berührt die Freigabe nicht.
  `openRegistrationWindow`/`closeRegistrationWindow`/
  `getRegistrationWindowRemainingSeconds` sind weg, ebenso
  `POST /api/exam/registration-window`, `buildRegistrationWindowPanel()`,
  `templates/admin-registration-window.hbs` und der Wrapper in
  `templates/home.hbs`.
- **Neuer Endpunkt** `POST /api/exam/registration` (`registration_open`),
  Antwort ist das ganze `#exam-admin-panel`.
- **Warnbalken `#exam-warning`** mit einer Zeile pro Ursache:
  `#exam-warning-internet` und `#exam-warning-registration` („freigegeben
  seit HH:MM"). Die Gefahrenliste entsteht in `buildExamHazards()`
  (`routes/render.ts`); `buildExamPanelData()` ersetzt die doppelte
  Panel-Konstruktion in `routes/admin.ts` und `routes/api.ts`.
- **Keine Rückfragen mehr** am Internet-Schalter und an beiden
  Stopp-Knöpfen — der rote Balken ist die Warnung. Die fünf
  Datenlösch-Rückfragen bleiben.
- **Abnahme (Stand nach diesem Commit):** 366 Deno-Tests, 13 E2E-Tests,
  `check`/`lint` grün.
  Details in `DECISIONS.md`.

## Erledigt am 2026-10-30 (Abschlusssession)

- **#144:** Appliance-Cleanup auf der Sense (Cronjob `scan scan` per API,
  `/root/examsense`, `/root/bin`, `exammode.sh`, `actions_*.conf`,
  `nmap_cron.sh`, `rc.d/uploadthing`, `/home/georg/uploadthing`,
  veraltete DB) und im Repo; `examsense` auf GitHub gelöscht, Historie
  als Bundle in `~/uploadthing-archive/`.
- **#148:** `scripts/backup-config.sh`, gpg-Chiffrat in
  `appliance/backups/` + `MANIFEST`, Doku; Restore-Probe auf XML-Ebene
  (byte-identisch zur Live-Config). Die Redaktion
  (`appliance/bin/redact-opnsense.sed`) deckt jetzt auch `<apikeys>`,
  `<user_apitoken>`, `<ldap_bindpw>`, `<bindpw>`, `<pre-shared-key>`
  und `<community>` ab — vorher lagen die API-Key-Hälften im
  öffentlichen Snapshot.
- **#149:** eigener API-Benutzer + Minimalrechtsprobe, `/root` 750,
  dnsmasq-`dell`-Eintrag auf die USB-MAC, Zertifikats-Checkliste,
  DNS-/IP-Übersicht.
- **#135:** Playwright-Smoke-Suite (`deno task e2e`), sechs Tests.
- **#151:** gefunden von der E2E-Suite und gleich behoben —
  `hx-disabled-elt="this"` war an Formular-Submits wirkungslos; jetzt
  `hx-disabled-elt="find button[type='submit']"` am Formular.

## Erledigt am 2026-10-31 (Security-Header gegen „Not secure")

- **Befund:** Chrome meldete bei `https://tst.spengergasse.at` „Not secure",
  obwohl das Zertifikat gültig war (LE, 14.10.2026–12.01.2027, TLS 1.3,
  HTTP/2). Diese Kombination ist per Definition **Mixed Content** — eine
  `http://`-Ressource auf einer https-Seite. Die Instanz liefert keine
  solche Referenz aus (HTML, alle CSS, Templates geprüft; Port 80 zu;
  CDP-`visibleSecurityStateChanged` sagt `secure`), der Auslöser kam vom
  Client (alter Cache, Extension, Proxy).
- **Fix:** `middleware/security_headers.ts` setzt auf jeder Antwort
  `Content-Security-Policy: upgrade-insecure-requests`; registriert in
  `main.ts` vor der Session-Middleware, damit auch 4xx/5xx die Header
  tragen.
- **Bewusst kein HSTS:** kein http-Dienst und keine Subdomains, dafür
  würde `max-age` die „Trotzdem fortfahren"-Notbremse bei manueller
  Zertifikatserneuerung entfernen. Steht so in `CONVENTIONS.md`.
- **Abnahme:** 4 Tests in `middleware/security_headers_test.ts` (Erfolg,
  Fragment, 500, Header-Werte) plus Endpoint-Prüfung auf `GET /`.
  360 Deno-Tests, `check`/`lint` grün.

## Erledigt am 2026-10-31 (Abgabe-Panel prüft selbst, #160 — seit #161 überholt)

- **Das Abgabe-Panel veraltete.** `exam_open` wurde einmal beim Rendern
  ausgewertet; wer die Seite vor dem Exam-Start geladen hatte, sah nur den
  Hinweis. Damals prüfte die geschlossene Karte bei Hover und Klick gegen
  `GET /abgabe-panel` (neuer Fragment-Endpunkt, nur `buildPanel`) und
  tauschte sich gegen das Formular. **Seit #161 entfällt der Trigger:** den
  Wechsel schiebt `static/events.js` über SSE, der Fragment-Endpunkt bleibt.
- **`throttle:3s`** verhinderte damals die Request-Schleife, die entsteht,
  weil der Swap den Knoten unter dem Cursor ersetzt; `click` war der Touch-
  und Tastaturweg. Die Trigger-Attribute existierten nur im geschlossenen
  Zweig, damit bei offenem Formular keine gewählte Datei verloren geht.
- **Gegenrichtung:** Endet das Examen bei offenem Formular, bleibt
  `POST /upload` bei 403; `htmx:responseError` holt das Panel neu, der
  Hinweis ersetzt das Formular.
- **Alpine-Init beim Panel-Swap** ergänzt (`Alpine.initTree` für
  `#abgabe-panel`) — vorher blieben Countdown und Dateiname nach jedem
  Panel-Swap stehen, auch nach dem Upload-POST. Seit #161 braucht es das
  nur noch für den Dateinamen; der Countdown läuft in `static/events.js`.
- **Alpine 3.15.12 → 3.17.5**; htmx bleibt 2.0.10 (letzte 2.x, 4.0.0 wird
  erst Anfang 2027 npm-`latest`). `cursor-pointer` ist jetzt in
  `ui-shell.css` definiert (war schon benutzt, aber nirgends deklariert).
- **Abnahme (damaliger Stand):** Endpoint-Test auf beide Zustände von
  `GET /abgabe-panel`;
  zwei E2E-Tests (Hover/Klick mit tickendem Countdown, Exam-Ende bei
  offenem Formular). 355 Deno-Tests, 12 E2E-Tests, `check`/`lint` grün.
  Issue #160 geschlossen.
- **Nebenbefund:** Der Test
  „GET /admin/students shows user anomalies …" scheiterte reproduzierbar
  außerhalb der Schulzeit, weil die Route den Zeitraum auf `spg_times`
  einrastet (Fenster liegt dann in der Zukunft). Der Test gibt den
  Zeitraum jetzt explizit mit; Details in `PITFALLS.md`.

## Erledigt am 2026-10-31 (Kopf, Portrait-Schalter, Du-Anrede, #158)

- **Kopf hatte unten 0 px Luft.** Navigation (Admins) und Namenskarte
  (Schüler) klebten an der Hero-Karte — gemessen bei 390 px und 1280 px.
  Jetzt `body > header { padding-bottom: 0.5rem }` in `ui-shell.css`,
  also 8 px auf allen Seiten; die Korrektur sitzt im Kopf, nicht in
  `nav.hbs`/`userbadge.hbs`.
- **Handy-Portrait:** Der Kopf bricht nicht mehr in drei Zeilen
  (unsichtbarer Platzhalter / h1 / Schalter), sondern bricht selbst um:
  `flex-wrap-reverse` schiebt den Theme-Schalter über den Hero, sobald
  der Titel nicht mehr daneben passt. 85 px statt 124 px; der
  Platzhalter-Button ist entfallen.
- **Hero-Breite:** Der Kopf nutzt jetzt `container px-2` wie `<main>`;
  bei 1280 px fluchten beide Kanten (1124 px statt 1264 px), `mt-2`
  wurde zu `pt-2` (die 8 px oben bleiben auch beim Scrollen).
- **Durchgängig „Du":** 11 Stellen (Toasts, `hx-confirm`-Dialoge,
  4xx-Meldungen) von „Sie/Ihr" auf „du/dein" umgestellt; unpersönliche
  Infinitiv-Aufforderungen bleiben bewusst. Neuer Test
  `test/ui_copy_test.ts` verbietet formelle Anrede in Templates und in
  den String-Literalen von `routes/` und `lib/schemas.ts`.
- **Abnahme:** neuer E2E-Test misst Abstände, Schalterposition und
  Kantenflucht. 354 Deno-Tests, 10 E2E-Tests, `check`/`lint` grün.
  Details in `DECISIONS.md`, Anrede-Regel in `CONVENTIONS.md`.

## Erledigt am 2026-10-31 (Admin-Dashboard, #157)

- **`/admin/application` ist jetzt ein Gruppendashboard:** drei thematische
  Gruppen (Prüfung, Unterlagen, Zugang & System) als
  `col-12 col-lg-6 col-xxl-4` — drei Spalten ab `xxl`, zwei ab `lg`, eine
  mobil. Der äußere Riesen-Card, sechs leere Flex-Wrapper, die
  `col-xl-8`-Zentrierung der Formulare und sämtliche `*-lg`-Controls sind
  weg; Unterlagen- und MAC-Liste sind `list-group` statt breiter Tabellen.
  Die Erfolgsmeldung steht über dem Raster (`#admin-success-message`),
  nicht mehr ungesehen am Seitenende. Details in `DECISIONS.md`.
- **Zeitfilter auf `/admin/students` ist eine Zeile** (Start, Switch,
  Ende, Suchen) statt eines ~300 px hohen Blocks. Ids, Feldnamen und die
  Alpine-Komponente sind unverändert, `hx-include` funktioniert weiter.
- **Abnahme:** E2E-Test misst die Geometrie (1600 px: drei Gruppen in
  einer Zeile; 1000 px: zwei plus Umbruch); Endpoint-Test prüft
  Gruppen-/Karten-Ids und die Position der Erfolgsmeldung. 352
  Deno-Tests, 9 E2E-Tests, `check`/`lint` grün.

## Erledigt am 2026-10-31 (Hero als Heimweg, #155)

- **`/whoami` war eine Sackgasse.** Schüler haben keine Navigation, und
  im Examen ist die Neuanmeldung gesperrt — wer über die Namenskarte
  dorthin kam, musste die Browser-URL editieren. Der Hero im Kopf ist
  jetzt ein Link auf `/` (`#hero-link`, `hx-boost` → `#app-content`,
  echtes `href` als Fallback). Details in `DECISIONS.md`.
- Boost-Navigation scrollt wieder nach oben: der afterSwap-Handler ruft
  `window.scrollTo({ top: 0 })` statt des seit #154 toten
  `#app-main.scrollTo(...)`.

## Erledigt am 2026-10-31 (Sauberer Shutdown, #156)

- **Der Dienst beendet sich jetzt selbst.** Vorher blieb der Prozess nach
  SIGTERM stehen und systemd killte ihn nach `TimeoutStopSec=20`
  (`State 'stop-sigterm' timed out`). Jetzt gilt die Reihenfolge
  Polling stoppen → HTTP auslaufen → SQLite schließen → `Deno.exit(0)`;
  ein Watchdog (10 s, unref'd) und ein zweites Signal als Notbremse.
- Die Logik liegt in `lib/shutdown.ts` mit fünf Tests in
  `lib/shutdown_test.ts`; `main.ts` verdrahtet nur noch die Schritte.
  Gemessen: Restart unter 0,1 s statt 20 s. Details in `DECISIONS.md`,
  Betriebsnotiz in `OPERATIONS.md`.

## Erledigt am 2026-10-31 (Code-Review-Funde)

Das Review über den Epic-Diff (`310e95a..HEAD`) fand vier Blocker; alle
sind behoben:

- **#152:** Admin-Ablehnungen lieferten **400 + komplettes Panel-HTML**,
  das im Toast als HTML landete; jetzt `c.text(<Meldung>, 4xx)`.
  `static/toast.js` baut den Dialog ohne `innerHTML`. Vier tote
  `hx-confirm`-Dialoge (u. a. vor der Datenbankbereinigung) funktionieren
  wieder, die Anmeldesperre erreicht auch angemeldete Schüler.
- **#153:** Die MAC-Freigabe las die MAC einer IP **ohne Zeitschranke** und
  übersprang Sichtungen ohne MAC — nach DHCP-Weitervergabe hätte das
  Vorgängergerät autorisiert. Jetzt `MAC_LOOKBACK_SECONDS = 300`, keine
  Freigabe ohne frische Sichtung mit MAC. `ADMIN_IPS` ist fail-strict,
  `startPolling` hat Tests, `ips_in_range` (toter Code) ist weg.
- **#154:** Die Handy-Ansicht war ein Scroll-Käfig (Body `overflow:
  hidden`, innerer Scrollcontainer mit ausgeblendeter Scrollbar, dritter
  Scrollbereich für die Doku-Links) und der Inhalt lag unter dem
  umbrechenden Kopf. Jetzt normales Dokument-Scrolling mit sticky Kopf.
  Auf kleinen Viewports steht das Anmelde-/Abgabe-Panel **vor**
  Angaben/Doku. Die Identitätskarte („Angemeldet als … · Ändern") sehen
  alle Angemeldeten; **„Abmelden" und `/logout` sind entfernt** — die
  Sitzung ist langlebig, die Identität wechselt über die Karte.
- Sekundärtext war im hellen Modus fast weiß (`--CTBS-SecondaryColor` aus
  der dunklen Palette) — Platzhalter und Hilfetexte waren unlesbar; jetzt
  `rgba(Body, 0.65)`.

## Pending

- [ ] **#163 Sichtprüfung** — der Deploy ist durch (2026-11-01, 03:28:43,
      Migrationen `0003`/`0004`, `event: stand` live bestätigt); offen ist
      die Ticket-Abnahme am Gerät: Identitätswechsel am Laptop und am Handy (Panel
      rendert genau einmal, das alte Kärtchen verschwindet), ein stiller
      Dauer-Ping über mehrere Minuten (kein Panel-Refresh, keine
      weiteren Presence-Zeilen), eine Abgabe tauscht **nur** das eigene
      Kärtchen
      (genau ein `/admin/student-card`-Request), „nicht anwesend"
      (`text-bg-danger`) erscheint nach einem Scan ohne die IP, und ein
      **leerer** Scan erzeugt einen `tikscan`-Eintrag, lässt die zuletzt
      anwesenden Kärtchen auf „nicht anwesend" gehen und zählt in
      `missed_count` mit. Dazu der h2-Beweis für `/admin/events` (Frames
      `stand` + `cards`/`card-…`/`tik`, `: ping` nach 20 s).

- [ ] **#161 Sichtprüfung** — neuer Schalter und Warnbalken auf
      `/admin/application` einmal mit laufendem Examen prüfen: Karte
      „Anmeldung während des Examens", Schalter an → Warnzeile mit
      „Seit HH:MM", Schalter aus → Balken weg; dazu das neue
      Push-Verhalten (Panel zieht ohne Klick nach, Abgabe-Panel wechselt
      beim Start/Ende von selbst, „Stand HH:MM:SS" und Ereignis-Zähler auf
      `/admin/students`, offenes Detail friert nur den Panel-Swap ein).
      Der Deploy selbst ist durch (13:08), der h2-Beweis ebenfalls.

- [ ] **Entscheidung: anonyme Namenssuche.** `/ldap` liefert ohne
      Anmeldung Namen **und Klasse** ab drei Zeichen (bewusst so in #146
      entschieden). Damit sind alle Schüler und Lehrpersonen im Netz
      aufzählbar. Optionen stehen in `DECISIONS.md`; es ist eine
      Betreiber-Entscheidung.
- [ ] **#150 htmx-4-Migration** (Februar 2027, wenn htmx 4 `latest`
      wird, und erst nach grüner E2E-Suite — die ist jetzt da).
- [ ] **Restore-Probe auf einer Wegwerf-VM** (XML-Ebene ist geprüft,
      Rückspielen in eine laufende Box nicht). Checkliste steht in
      `docs/ai/OPERATIONS.md`. Achtung: erster Start nur mit
      „Not attached", sonst kollidiert `192.168.21.1`.
- [ ] **GPG-Key ohne Passphrase** — bewusst offen: Passphrase heißt,
      dass ein Restore nicht mehr unbeaufsichtigt läuft. Entscheidung
      steht aus.
- [ ] **Zertifikatserneuerung `tst.spengergasse.at`** bis 2027-01-12;
      Erinnerung im Dezember, Checkliste in `OPERATIONS.md`.
- [ ] **Handy-Abnahme der Sperre** im Prüfungs-WLAN: `doku` scharf →
      `example.com` scheitert, `learn.microsoft.com` geht; danach aus.
- [ ] **Lehrer-Login vom Dell** einmal mit echten LDAP-Daten bestätigen
      (`.2` steht in `ADMIN_IPS`).
- [ ] Deno-Hygiene auf der Sense ist mit dem Cleanup entfallen; auf dem
      Dell läuft 2.9.7.
- [ ] Runtime-Frage nach der Saison 2026/27 neu stellen (Deno-Deprecation;
      Ziel wäre Node auf Linux, dann `drizzle-orm/better-sqlite3`).

## Completed (Epic #141, chronologisch)

- [x] #142 OPNsense-API-Client: Exam-Sperre ausschließlich über die
      Firewall-API (`searchRule`/`toggleRule`/`apply`), kein
      `exammode.sh`, kein Subprozess.
- [x] #143 Umzug auf den Dell als systemd-User-Unit; Daten und DB
      migriert, End-to-End mit gültigem Zertifikat geprüft.
- [x] #145 Tik-Polling im App-Prozess (`tik.ts` → `ipfact` mit MAC),
      `POST /activeips` und `routes/machine.ts` entfernt.
- [x] #146 Eine Schülerseite (`/`): Angaben + Doku-Links links,
      Anmeldung/Abgabe rechts, Namenssuche ab drei Zeichen,
      Registrierungssperre im Examenfenster mit Admin-Freigabe.
- [x] #133 Drizzle als Schema- und Migrationsautorität, Prisma-Rückbau,
      Migrationen beim App-Start (`BEGIN EXCLUSIVE`).
- [x] #134 Admin-Upload für Unterlagen (`/admin/application`),
      eigene Env `UNTERLAGEN_PERMITTED_FILETYPES`.
- [x] #147 MAC-basierte Admin-Freigabe (Tabelle `adminmac`, Migration
      `0002_adminmac`), `ADMINS` entfernt.
- [x] #144, #148, #149, #135, #151 — siehe oben.

## Erledigt aus früheren Sitzungen (Auszug)

- #142/#137 TLS, #131 Exam-State-Machine, #136 natives TLS (geschlossen),
  #140 in #142/#145 aufgeteilt.

## Blockers

None.

## Next Session Suggestion

Zuerst die Sichtprüfung, die die Tests nicht ersetzen können: der Deploy von
#163 ist durch (`stand` live bestätigt), offen ist die Ticket-Abnahme —
Identitätswechsel am Laptop und am Handy, ein stiller Dauer-Ping ohne
Panel-Refresh, eine Abgabe, die nur ihr Kärtchen tauscht, „nicht anwesend"
nach einem Scan ohne die IP und ein leerer Scan. Anschließend der Rest des
Betriebs-Beweises für `/admin/events`: `cards`/`card-<slug>`/`tik` nach
einer echten Aktivität und `: ping` nach 20 s. Danach die offene
Sichtprüfung aus #161
(Schalter → roter Balken → zurück). Die betrieblichen Abnahmen (Handy-Test
der Sperre, Lehrer-Login vom Dell, Zertifikat bis 2027-01-12) stehen
unverändert an. Wer Code anfassen will, nimmt #150 — aber erst, wenn htmx 4
`latest` ist.
