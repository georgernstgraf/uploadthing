Last updated: 2026-10-30 (#145 umgesetzt — Tik-Polling ersetzt `/activeips`).

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
- Nächster Schritt darauf: #147 (MAC-basierte Admin-Freigabe).

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
