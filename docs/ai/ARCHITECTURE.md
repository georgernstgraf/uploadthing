# Architecture

Living structural map of the system as of 2026-10-30.
Overwritten when structural changes occur during a session.

## Overview

uploadthing ist eine **Deno**-Web-App (Hono, server-gerendert mit Handlebars,
htmx 2.0.10, Bootstrap) für Abgaben bei Prüfungen an einer HTL. Sie läuft seit
2026-10-30 als systemd-**User**-Dienst **auf dem Dell** (aus dem Repo), gebunden
auf `192.168.21.2:443` mit eigenem TLS. Die OPNsense-Sense davor ist nur noch
Firewall/DNS/DHCP; alles, was die Prüfungssituation steuert — Internet-Sperre,
IP-/MAC-Präsenz, Anmeldefenster — läuft im App-Prozess. Persistenz ist eine
SQLite-Datei über `@db/sqlite`; Schemaautorität ist Drizzle (keine
Prisma-Engines, keine Runtime-Abhängigkeit auf Prisma).

## Komponenten

| Ebene | Dateien | Verantwortung |
|---|---|---|
| HTTP | `main.ts`, `routes/*.ts` | Hono-App, Routen, HTMX-Panels |
| Rendering | `routes/render.ts`, `templates/*.hbs`, `lib/handlebars.ts` | eine Schülerseite, Admin-Seiten, Partial-Rendering |
| Services | `service/*.ts` | Fachlogik: `exam`, `opnsense`, `tik`, `adminmac`, `unterlagen`, `ldapuser`, `admin`, `abgaben` |
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
  es als Fragment, damit die geschlossene Karte bei Hover/Klick den
  Exam-Zustand nachziehen kann (#160).
- **Exam-Sperre**: App → `https://sense.internal/api/firewall/filter/…`
  (`toggleRule` + `apply`, gelesen über `searchRule`), TLS gegen die interne
  CA (`DENO_CERT`). Kein Polling: Zustand wird beim Rendern bzw. bei einer
  Aktion gelesen.
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
