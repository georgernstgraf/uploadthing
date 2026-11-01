# Architecture

Living structural map of the system as of 2026-11-01.
Overwritten when structural changes occur during a session.

## Overview

uploadthing ist eine **Deno**-Web-App (Hono, server-gerendert mit Handlebars,
htmx 2.0.10, Bootstrap) für Abgaben bei Prüfungen an einer HTL. Sie läuft seit
2026-10-30 als systemd-**User**-Dienst **auf dem Dell** (aus dem Repo), gebunden
auf `192.168.21.2:443` mit eigenem TLS. Die OPNsense-Sense davor ist nur noch
Firewall/DNS/DHCP; alles, was die Prüfungssituation steuert — Internet-Sperre,
IP-/MAC-Präsenz, Anmelde-Freigabe — läuft im App-Prozess. Zustandsänderungen
erreichen den Browser per Server-Sent Events (SSE, Kanäle `exam`, `activity`
und `unterlagen`, #161/#164), nicht per Polling. Der `exam`-Kanal schickt einen
vollständigen Snapshot; der `activity`-Kanal transportiert seit #163
**Komponentennamen** (`cards`, `card-<slug>`, `tik`) plus einen
Text-Frame `stand`. Der `unterlagen`-Kanal ist ein reiner Tick: die
Schüler-Seite holt daraufhin `GET /angaben-panel`. Persistenz ist eine
SQLite-Datei über `@db/sqlite`;
Schemaautorität ist Drizzle (keine Prisma-Engines, keine
Runtime-Abhängigkeit auf Prisma).

## Komponenten

| Ebene | Dateien | Verantwortung |
|---|---|---|
| HTTP | `main.ts`, `routes/*.ts` | Hono-App, Routen, HTMX-Panels, SSE-Endpunkte (`routes/events.ts`, `/admin/events`) |
| Rendering | `routes/render.ts`, `templates/*.hbs`, `lib/handlebars.ts`, `static/events.js`, `static/htmx-ext-sse.js` | eine Schülerseite, Admin-Seiten, Partial-Rendering; Client für Push, Countdown und Forensik-Refresh |
| Services | `service/*.ts` | Fachlogik: `exam`, `exam_watchdog`, `events`, `opnsense`, `tik`, `adminmac`, `unterlagen`, `ldapuser`, `admin`, `abgaben`, `cookiepresents`, `ipadmin` |
| Push | `lib/event_hub.ts`, `lib/sse.ts`, `service/events.ts` | prozesslokaler Bus (kein Event-Log), SSE-Streams (Header/Heartbeat/Shutdown), Kanäle `exam`/`activity`/`unterlagen`, Exam-Snapshot, Komponenten-Koaleszierung, Unterlagen-Tick |
| Repos | `repo/*.ts` | handgeschriebenes SQL mit prepared Statements |
| Migrationen | `drizzle/schema.ts`, `drizzle/*.sql`, `lib/migrate.ts` | Schema + Start-Migration |
| Config | `lib/config.ts` | fail-strict Env-Parsing (deutsche Fehler) |
| Deployment | `systemd/uploadthing.service` (User-Unit), `~/.config/uploadthing/uploadthing.env`, `~/uploadthing-data/` | Dienst, Produktions-Env, Daten |
| Appliance | `appliance/` | nur noch Artefakte, kein Laufzeitcode: `config.xml`-Redaktion (`bin/redact-opnsense.sed`), devd-USB-Regel (`files/`), MikroTik-Material, redigierter Snapshot (`current/config.redacted.xml`), Legacy-Regel-CSV |

## Knowledge Files (`docs/ai/`)

| File | Purpose | Update mode |
|------|---------|------------|
| HANDOFF.md | Offene Aufgaben für die nächste Session | Overwrite |
| DECISIONS.md | Aktive Entscheidungen | Append; Ersetztes → HISTORY.md |
| ARCHITECTURE.md | Strukturkarte | Overwrite |
| CONVENTIONS.md | Laufende Regeln | Append |
| PITFALLS.md | Erfahrungswissen zu Fehlern | Append |
| DOMAIN.md | Fachliche Regeln | Append |
| STATE.md | Projektstatus | Overwrite |
| OPERATIONS.md | Betrieb (Deployment, Netz, DNS, Zertifikate) | Append |
| HISTORY.md | Archiv ersetzter Einträge | Append-only |

## Data Flows

- **Schüler**: Browser → `https://tst.spengergasse.at` (Dell:443) → Hono →
  Handlebars; Login gegen LDAP (`ldaps://ldap.spengergasse.at`, Filter über
  `givenName`/`sn`/`mail`/`sAMAccountName`), Abgabe als Datei nach
  `ABGABEN_DIR`, Metadaten in SQLite (`abgaben`, `users`, `registrations`).
  Das Abgabe-Panel ist serverseitig gerendert; `GET /abgabe-panel` liefert
  es als Fragment, das `static/events.js` bei einem Zustandswechsel holt
  (#161).
- **Push-Kanäle (#161, #164)**: Zwei SSE-Endpunkte, je ein Endpunkt pro
  Verbindung. `GET /events/exam` (`exam` **und** `unterlagen`) steht jeder
  angemeldeten Person offen — 401 ohne Sitzung, weil Schüler das Panel,
  die Angaben-Karte und Lehrpersonen das Admin-Panel daraus ziehen.
  `GET /admin/events` (`activity`) hängt am `requireAdmin`-Riegel der
  Admin-Routen, Schüler bekommen 403. Der Exam-Kanal sendet beim Verbinden
  einen vollständigen Snapshot und danach einen Frame je Tick; die
  Unterlagen laufen als `event: unterlagen` (`data: null`) auf derselben
  Verbindung. Der Admin-Kanal sendet `stand` (Text) und danach je Batch die
  Komponentennamen `cards`, `card-<slug>` und `tik`. Es gibt kein
  Event-Log und kein `Last-Event-ID`.
- **Wer publiziert**: `service/exam.ts` bei jedem Zustandswechsel
  (`start`, `pause`, `resume`, `stop`, `addExtra`, Abschluss,
  Anmelde-Schalter) und der `exam_watchdog` über denselben Abschluss-Pfad;
  auf dem Activity-Kanal `service/tik.ts` (jeder abgeschlossene Abruf →
  `tik`, nach Erfolg zusätzlich der Scan-Delta als `cards`/`card-<slug>`),
  `service/abgaben.recordSubmission` (`card-<slug>`),
  `service/user.register` und `middleware/session.ts` (Cookie-Presence:
  **jede** neue Schüler-Präsenz → `cards`, #164; Lehrperson und
  `POST /upload` ausgenommen) — alle über `noteAdminActivity()`, damit die
  1-s-Koaleszierung greift. `service/unterlagen.ts` publiziert
  `unterlagen` nach `upload`, `remove` und `removeAll` (nur wenn Zeilen
  gelöscht wurden).
- **Wer konsumiert**: zwei Client-Besitzer, klar getrennt. `static/events.js`
  hält den `exam`-Stream: Countdown (`data-ends-at-ms` plus
  Serveruhr-Offset aus `server_now_ms`), Tausch von `#abgabe-panel` bei
  `open`-Wechsel, Nachziehen des Admin-Panels (`GET /api/exammode`) bei
  Status- oder Freigabe-Änderungen, Tausch von `#angaben-panel` bei
  `event: unterlagen` (inklusive Nachholen nach einem Reconnect; #164),
  Freeze-Zähler und Aufgeben-Policy. Den `activity`-Stream hält seit #163
  die vendorte `htmx-ext-sse`:
  `sse-connect` am Admin-Container, `hx-trigger="sse:cards"` am Panel,
  `sse:card-<slug>` am Kärtchen, `sse:tik` am Streifen,
  `sse-swap="stand"` an der Statuszeile. `events.js` zählt nur noch den
  Freeze und holt ihn beim Entfrieren nach.
- **Fragmente**: `GET /angaben-panel` liefert nur die Angaben-Karte
  (`templates/angaben.hbs`, Wurzel `#angaben-panel`, Partial in
  `home.hbs`; #164). `GET /admin/student-card?ip=…&startdate=…`
  liefert genau ein Kärtchen (`templates/admin-student-card.hbs`, für IPs
  ohne Identität `admin-student-card-unknown.hbs`; **204** ohne Zeile im
  Zeitraum), `GET /admin/tik-panel` nur den MikroTik-Streifen. Die beiden
  Admin-Fragmente benutzen `parseAdminRange` — dieselbe Zeitraum-Auflösung
  wie `/admin/students` und `/admin/ip-detail` (inklusive Einrasten auf
  `spg_times`). `card_url`, `slug` und `tone` baut `routes/render.ts` aus
  `lib/slug.ts`.
- **Der Zustand wird beim Senden aus der DB gebaut.**
  `service/events.snapshotExam()` liest den aktuellen Stand (passiv, ohne
  lazy Abschluss); der Admin-Kanal versendet dagegen die Komponentennamen
  selbst, es gibt keinen Activity-Snapshot mehr.
- **Exam-Sperre**: App → `https://sense.internal/api/firewall/filter/…`
  (`toggleRule` + `apply`, gelesen über `searchRule`), TLS gegen die interne
  CA (`DENO_CERT`). Kein Polling des Firewall-Zustands: er wird beim
  Rendern, bei einer Aktion und beim Push-Refresh gelesen; die App
  publiziert den Anlass, nicht den Firewall-Zustand.
- **IP-/MAC-Präsenz**: `service/tik.ts` → `http://tik.internal/rest/interface/
  wireless/registration-table` (Basic-Auth, 60 s + Sofortabruf) → `tikscan`
  (eine Zeile je abgeschlossenem Abruf, auch leer) und `ipfact`
  (IP, MAC, `seen`). `tikscan` ist die Scan-Achse für `is_stale`,
  `missed_count`, `examPresence()` und den Scan-Delta; `ipfact` bleibt die
  Sichtachse. `examPresence()` zählt seit #166 Dropouts/Minuten ab der
  ersten Sichtung im laufenden Examen und markiert einen IP-Wechsel; die
  Abgabe sperrt sie nicht mehr. Grundlage für die MAC-basierte
  Admin-Freigabe.
- **DNS**: Dell → `192.168.21.1` (Unbound auf der Sense; Host Overrides
  `tst` → `.2`, `tik.internal` → `.5`, `sense.internal` → `.1`).
- **Datenbank**: `~/uploadthing-data/uploadthing.db` (WAL), Migrationen beim
  Start unter `BEGIN EXCLUSIVE`.

## Datenmodell

| Tabelle | Inhalt |
|---|---|
| `users` | Identitäten aus LDAP (Name, Klasse, Mail) |
| `registrations` | ausdrückliche Anmeldungen (Identität → IP), Audit-Verlauf |
| `cookiepresents` | Präsenz je (IP, Identität); jede Cookie-Anfrage **und** jede Registrierung, 30-s-Dedupe, alleinige Attributionsquelle der Forensik (#163) |
| `tikscan` | Scan-Zeitachse, eine Zeile je abgeschlossenem Abruf inklusive leerer (#163) |
| `ipfact` | Sichtungen je Scan (IP, MAC, `seen`) |
| `abgaben` | Abgabedateien und Metadaten |
| `examstate` | Singleton des Exam-Zustands (Status, Dauer, Pause, Zusatzzeit) |
| `adminmac` | freigegebene Geräte für die Lehrpersonen-Anmeldung (#147) |

Migrationen `0003_tikscan` und `0004_backfill_cookiepresents` gehören zu
#163; die Datenbankbereinigung räumt alle zeitbasierten Tabellen mit einem
Ein-Jahres-Cutoff auf.

## Sicherheitsgrenzen

- Admin ist, wer `klasse === "LehrendeR"` hat **und** von einer IP aus
  `ADMIN_IPS` oder von einer freigegebenen MAC kommt. Die MAC-Freigabe ist
  Komfort, keine Sicherheitsgrenze (spoofbar).
- Die Exam-Sperre ist eine Firewall-Regel (Node), kein App-Gate: `doku`
  (reject, LAN → alles außer Alias `DOKU`) scharf/aus.
- Secrets liegen ausschließlich in der Produktions-`.env` bzw. in
  `~/sense.internal_root_apikey.txt` (Modus 600) — nie im Repo.
