# Architecture

Living structural map of the system as of 2026-10-31.
Overwritten when structural changes occur during a session.

## Overview

uploadthing ist eine **Deno**-Web-App (Hono, server-gerendert mit Handlebars,
htmx 2.0.10, Bootstrap) für Abgaben bei Prüfungen an einer HTL. Sie läuft seit
2026-10-30 als systemd-**User**-Dienst **auf dem Dell** (aus dem Repo), gebunden
auf `192.168.21.2:443` mit eigenem TLS. Die OPNsense-Sense davor ist nur noch
Firewall/DNS/DHCP; alles, was die Prüfungssituation steuert — Internet-Sperre,
IP-/MAC-Präsenz, Anmelde-Freigabe — läuft im App-Prozess. Zustandsänderungen
erreichen den Browser per Server-Sent Events (SSE, Kanäle `exam` und
`activity`, #161), nicht per Polling. Persistenz ist eine
SQLite-Datei über `@db/sqlite`; Schemaautorität ist Drizzle (keine
Prisma-Engines, keine Runtime-Abhängigkeit auf Prisma).

## Komponenten

| Ebene | Dateien | Verantwortung |
|---|---|---|
| HTTP | `main.ts`, `routes/*.ts` | Hono-App, Routen, HTMX-Panels, SSE-Endpunkte (`routes/events.ts`, `/admin/events`) |
| Rendering | `routes/render.ts`, `templates/*.hbs`, `lib/handlebars.ts`, `static/events.js` | eine Schülerseite, Admin-Seiten, Partial-Rendering; der Browser-Client für Push, Countdown und Forensik-Refresh |
| Services | `service/*.ts` | Fachlogik: `exam`, `exam_watchdog`, `events`, `opnsense`, `tik`, `adminmac`, `unterlagen`, `ldapuser`, `admin`, `abgaben`, `cookiepresents` |
| Push | `lib/event_hub.ts`, `lib/sse.ts`, `service/events.ts` | prozesslokaler Bus (kein Event-Log), SSE-Streams (Header/Heartbeat/Shutdown), Kanäle `exam`/`activity` samt Snapshots |
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
- **Push-Kanäle (#161)**: Zwei SSE-Endpunkte, je ein Endpunkt pro Kanal.
  `GET /events/exam` (`exam`) steht jeder angemeldeten Person offen — 401
  ohne Sitzung, weil Schüler das Panel und Lehrpersonen das Admin-Panel
  daraus ziehen. `GET /admin/events` (`activity`) hängt am
  `requireAdmin`-Riegel der Admin-Routen, Schüler bekommen 403. Beide
  senden beim Verbinden einen vollständigen Snapshot und danach einen
  Frame je Tick; es gibt kein Event-Log und kein `Last-Event-ID`.
- **Wer publiziert**: `service/exam.ts` bei jedem Zustandswechsel
  (`start`, `pause`, `resume`, `stop`, `addExtra`, Abschluss,
  Anmelde-Schalter) und der `exam_watchdog` über denselben Abschluss-Pfad;
  auf dem Activity-Kanal `service/tik.ts` (jeder abgeschlossene Abruf),
  `service/user.register` (Registrierung), `service/abgaben.recordSubmission`
  (Abgabe), `middleware/session.ts` (Cookie-Presence, nur echter Insert und
  nur für Nicht-Lehrpersonen) — alle über `noteAdminActivity()`, damit die
  1-s-Koaleszierung greift.
- **Wer konsumiert**: `static/events.js` im Browser. Der `exam`-Stream
  tickt den Countdown (`data-ends-at-ms` plus Serveruhr-Offset aus
  `server_now_ms`), tauscht `#abgabe-panel` bei `open`-Wechsel und holt das
  Admin-Panel (`GET /api/exammode`) bei Status- oder
  Freigabe-Änderungen. Der `activity`-Stream stößt den Forensik-Refresh an
  (`admin-refresh`-Event auf `#admin-report-panel`) oder zählt in
  `#admin-refresh-pending`, solange Details offen sind (`#admin-refresh-stand`
  zeigt die Serverzeit des letzten Frames).
- **Der Zustand wird beim Senden aus der DB gebaut.**
  `service/events.snapshotExam()`/`snapshotActivity()` lesen den aktuellen
  Stand (passiv, ohne lazy Abschluss); der Bus transportiert nur Ticks.
- **Exam-Sperre**: App → `https://sense.internal/api/firewall/filter/…`
  (`toggleRule` + `apply`, gelesen über `searchRule`), TLS gegen die interne
  CA (`DENO_CERT`). Kein Polling des Firewall-Zustands: er wird beim
  Rendern, bei einer Aktion und beim Push-Refresh gelesen; die App
  publiziert den Anlass, nicht den Firewall-Zustand.
- **IP-/MAC-Präsenz**: `service/tik.ts` → `http://tik.internal/rest/interface/
  wireless/registration-table` (Basic-Auth, 60 s + Sofortabruf) → `ipfact`
  (IP, MAC, `seen`). Grundlage für die MAC-basierte Admin-Freigabe.
- **DNS**: Dell → `192.168.21.1` (Unbound auf der Sense; Host Overrides
  `tst` → `.2`, `tik.internal` → `.5`, `sense.internal` → `.1`).
- **Datenbank**: `~/uploadthing-data/uploadthing.db` (WAL), Migrationen beim
  Start unter `BEGIN EXCLUSIVE`.

## Sicherheitsgrenzen

- Admin ist, wer `klasse === "LehrendeR"` hat **und** von einer IP aus
  `ADMIN_IPS` oder von einer freigegebenen MAC kommt. Die MAC-Freigabe ist
  Komfort, keine Sicherheitsgrenze (spoofbar).
- Die Exam-Sperre ist eine Firewall-Regel (Node), kein App-Gate: `doku`
  (reject, LAN → alles außer Alias `DOKU`) scharf/aus.
- Secrets liegen ausschließlich in der Produktions-`.env` bzw. in
  `~/sense.internal_root_apikey.txt` (Modus 600) — nie im Repo.
