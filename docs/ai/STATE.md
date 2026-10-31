# Project State

Current status as of 2026-10-31.

## Current Focus

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
- **Tests**: 352 Deno-Tests (~5 s) plus neun Playwright-Smoke-Tests in
  `deno task e2e` (~12 s, Chromium, eigene Wegwerf-DB auf Port 8099).

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

## Erledigt am 2026-10-31 (Abgabe-Panel prüft selbst, #160)

- **Das Abgabe-Panel veraltete.** `exam_open` wurde einmal beim Rendern
  ausgewertet; wer die Seite vor dem Exam-Start geladen hatte, sah nur den
  Hinweis. Die geschlossene Karte prüft jetzt bei Hover und Klick gegen
  `GET /abgabe-panel` (neuer Fragment-Endpunkt, nur `buildPanel`) und
  tauscht sich gegen das Formular.
- **`throttle:3s`** verhindert die Request-Schleife, die entsteht, weil der
  Swap den Knoten unter dem Cursor ersetzt; `click` ist der Touch- und
  Tastaturweg. Die Trigger-Attribute existieren nur im geschlossenen
  Zweig, damit bei offenem Formular keine gewählte Datei verloren geht.
- **Gegenrichtung:** Endet das Examen bei offenem Formular, bleibt
  `POST /upload` bei 403; `htmx:responseError` holt das Panel neu, der
  Hinweis ersetzt das Formular.
- **Alpine-Init beim Panel-Swap** ergänzt (`Alpine.initTree` für
  `#abgabe-panel`) — vorher blieben Countdown und Dateiname nach jedem
  Panel-Swap stehen, auch nach dem Upload-POST.
- **Alpine 3.15.12 → 3.17.5**; htmx bleibt 2.0.10 (letzte 2.x, 4.0.0 wird
  erst Anfang 2027 npm-`latest`). `cursor-pointer` ist jetzt in
  `ui-shell.css` definiert (war schon benutzt, aber nirgends deklariert).
- **Abnahme:** Endpoint-Test auf beide Zustände von `GET /abgabe-panel`;
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

Der Betrieb ist vollständig; die nächsten Schritte sind Abnahmen, keine
Umbauten: Handy-Test der Sperre im Prüfungsnetz, Lehrer-Login vom Dell,
Zertifikatserneuerung im Dezember. Wer Code anfassen will, nimmt #150 —
aber erst, wenn htmx 4 `latest` ist.
