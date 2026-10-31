# PITFALLS

## Test Environment In Dev Checkout

- `scripts/test-with-server.sh` sourced lange nur `.env`, während die
  Pflichtvariablen `ABGABEN_DIR`/`UNTERLAGEN_DIR`/`COOKIE_SECRET` nur in
  `.env.local` standen: `deno task test` starb beim Start mit
  `requireEnv()`-Fehlern (11 Module, 60/71 Tests). Seit 2026-10-30 ist die
  `.env` des dell-Checkouts vollständig, und `examstate` ist migriert —
  `deno task test` ist dort grün (252 Tests).
- `.env.local` wird von Deno nicht geladen; wer neue Pflichtvariablen
  einführt, muss sie in `.env` (und `.env.example`) nachziehen.
- Läuft `deno task test` mit `no such table: …`, fehlt die Migration im
  lokalen `DATABASE_URL`-Ziel: `deno task db:migrate` ausführen (nicht die
  Tabelle von Hand anlegen). Normalerweise passiert das nicht, weil der
  App-Start die Migrationen mitzieht.

## Fail-Strict Configuration

- Config is fail-fast: all required env vars are validated at module load time via `requireEnv()` and `parseRequiredIpList()`.
- Do not add new optional env vars with silent fallbacks for security-relevant or operation-critical settings; use `requireEnv()` instead.
- The `!` non-null assertion pattern is no longer sufficient; use `requireEnv()` so the error message describes which variable is missing.
- If `deno task start` fails immediately with a German error message, check that all required env vars in `lib/config.ts` are present in the environment.

## Outdated Testing References

- Ignore old guidance that mentions `deno task testdb` or `main_test_db.ts`; they are not part of the current workflow.
- `main_test.ts` is only a placeholder and not the active test harness.
- The required validation commands are `deno task check`, `deno task lint`, and `deno task test`.

## Formular-Validierung mit zod-form-data

- `zfd.text()` macht aus einem **leeren** Formularfeld `undefined`, nicht
  `""`. Ohne `required_error` liefert Zod dann `"Required"` und die
  englische Meldung landet in der deutschen UI. Bei Pflichtfeldern deshalb
  `z.string({ required_error: "<deutsche Meldung>" })` setzen und die
  Meldung zusätzlich bei `.min(1, …)` wiederholen (für reine
  Leerzeichen-Eingaben).

## IP Trust Assumptions

- Do not introduce logic that trusts `X-Forwarded-For` or similar headers without an explicit architectural change.
- The admin and audit model depends on the socket IP from `c.env.info.remoteAddr`.

## Admin Role Assumptions

- Admin access is inferred from `remoteuser?.klasse === "LehrendeR"` via
  `service/user.isTeacher()`. Since #147 a teacher may additionally log in
  from an approved device MAC (table `adminmac` or `ADMIN_MACS`) when the
  socket IP is not in `ADMIN_IPS`; that device approval never grants admin
  rights on its own. Do not assume there is a separate role table or
  permission framework.
- Do not re-check the MAC/IP gate on every request: the restriction belongs
  to the login (`routes/auth.ts`), so a failing Tik poll cannot strip admin
  rights from a running session.
- The MAC for an IP comes from the newest `ipfact` row with a MAC. Never add
  a Tik call to the request path (login latency, five-second timeout, Tik
  outages).

## Persistence Gotchas

- Persistence is deliberately split: Drizzle owns the schema, everything at
  runtime is hand-written SQL through `@db/sqlite` (`repo/*.ts`). Do not
  describe the app as ORM-based, and do not move repositories onto a query
  builder "while we are at it".
- Repositories using direct SQLite prepared statements expect UTC ISO timestamps.
- Do not hand-edit index/drop-index migration SQL when the change belongs in
  Drizzle schema state; change `drizzle/schema.ts` first and generate the
  migration with `deno task db:generate --name <migration_name>`.
- `DATABASE_URL` stays Prisma-compatible: `file:../uploadthing.db` is resolved
  relative to the former `prisma/` directory (`lib/dbpath.ts`). Resolving it
  anywhere else opens the wrong database and surfaces missing-table errors
  like `no such table: ipfact`.
- Never mark a migration as applied by hand and never edit
  `drizzle/meta/`. If a migration went in wrong, restore the DB backup and
  fix the migration forward.

## Upload Safety

- Uploaded filenames must go through `safeFileComponent` and versioned path handling.
- Do not add raw path joins or trust user-provided filenames.
- Upload behavior is constrained by `MAX_UPLOAD_MB`, `PERMITTED_FILETYPES`, and filesystem directories from env.
- `PERMITTED_FILETYPES` starts from env but can be changed at runtime by admins, so do not assume it is immutable after process start.
- Unterlagen (`/admin/unterlagen`, #134) have their **own** list
  `UNTERLAGEN_PERMITTED_FILETYPES` (default `md`). Never validate
  Unterlagen against `PERMITTED_FILETYPES` — that one describes student
  submissions and is runtime-editable in the admin UI.
- Unterlagen are replaced, not versioned: `getVersionedPath` belongs to
  `ABGABEN_DIR` only. The Unterlagen directory stays flat, and
  `service/unterlagen.remove()` only accepts names that exist as plain
  files in the directory listing (no `..`, no separators, no symlink
  targets).
- A file in `UNTERLAGEN_DIR` that is not a regular file (symlink,
  directory) must never be opened for writing; `upload()` refuses it.

## Test Suite Sharp Edges

- `deno task test` starts the app through `scripts/test-with-server.sh` and then runs `deno test -A --env-file`.
- The repository root `vacuum.db` is intended to remain a clean slate; never write into it directly.
- When a writable test or local database is needed, copy `vacuum.db` to the path referenced by `DATABASE_URL` instead.
- Some endpoint tests and JSON fixtures still reference routes or behaviors that are stale, permissive, or destructive, such as `/admin/logs` and `/admin/wipe-abgaben`.
- Read tests before changing behavior and do not assume they perfectly describe the current product surface.
- If shutdown handling changes, remember that closing the SQLite handle alone is not enough; the `Deno.serve` server must also be stopped or the process will keep running after SIGINT.
- Local developer activity mutates `uploadthing.db`, so forensic endpoint tests that depend on localhost state become flaky unless they explicitly clear and reseed `127.0.0.1` through shared fixtures first.

## External Dependency Risks

- `drizzle-kit` must never become a runtime dependency: it carries esbuild
  binaries and is only used on the development machine. Never add it to an
  import chain that the app (or `deno task start`) loads. See
  `docs/ai/OPERATIONS.md`.
- `drizzle-kit` only resolves `drizzle-orm` when Deno materializes
  `node_modules`; that is why `deno task db:generate` passes
  `--node-modules-dir=auto`. Without it the CLI prints
  "Please install latest version of drizzle-orm" and exits. The resulting
  `node_modules/` is gitignored and belongs to the kit only.
- LDAP access can be slow or unavailable; the code includes reconnect logic and retry timing.
- Do not start LDAP connections at module import time; eager startup causes unrelated tests to leak timers, reads, and TLS handshakes.

## OPNsense 26.7: Migration Assistant und der Legacy-Block

- OPNsense 26.7 hält Firewall-Regeln an zwei Stellen: den **alten**
  `<filter><rule>`-Block und den **neuen** Store unter
  `<OPNsense><Firewall>`. Die API, das GUI und `pf` lesen den neuen Store.
- `Firewall → Migration → Migration assistant` ist **kein Konverter**:
  `countRules`, `downloadRules` (CSV) und `flush`. Die eigentliche Übernahme
  passiert beim Upgrade automatisch. Regeln, die als „migriert" erscheinen
  (`ref: ui/firewall/migration`, `legacy: true`), sind **Verweise auf den
  Legacy-Block** — `flush` löscht deren Quelle und damit die Regeln selbst.
- **2026-10-30 so passiert:** Nach dem Flush fehlten fünf Regeln, darunter
  „Default allow LAN to any rule" → im Prüfungsnetz war kein Internet mehr
  über die Sense, und DNS-Anfragen des Dell an `192.168.21.1:53` liefen ins
  Leere. Wiederhergestellt aus dem vorher exportierten CSV
  (`appliance/legacy-rules-2026-10-30.csv`), Reihenfolge und `doku`-Position
  manuell geprüft.
- **Lehre:** Vor `flush` immer `downloadRules` (CSV) ziehen **und** prüfen,
  ob die im neuen Store sichtbaren Regeln nach dem Flush noch existieren.
  Danach `pfctl -sr` gegen die erwartete Regelzahl stellen und einen
  Konnektivitätstest über die Sense machen, nicht nur die GUI aufrufen.
- Kategorien überleben den Flush nicht mit ihren Zuordnungen. Regeln
  bekommen Kategorien per `setRule` **nur mit der Kategorie-UUID**
  (`/api/firewall/category/searchItem` liefert sie); der Name wird mit
  „Related category not found" abgelehnt.
- **`setRule` mit Teil-Payload ist nicht harmlos.** Ein Aufruf mit nur
  `{"rule":{"categories":"<uuid>"}}` lieferte `saved`, und die API meldete
  für die Sperrregel anschließend kurzzeitig `enabled=1`, obwohl in der
  `config.xml` `<enabled>0</enabled>` stand. Nach **jedem** `setRule`
  den Zustand erneut über `searchRule` lesen und mit `pfctl -sr`
  gegenprüfen, dass keine `reject`-Regel aktiv ist — sonst sperrt ein
  Kategorien-Setzen im Zweifel das Netz.

## Firewall-API (Exam-Sperre)

- Die Sperre läuft ausschließlich über die OPNsense-API. Kein `exammode.sh`,
  kein `sudo`, kein Schreiben in `/conf/config.xml`.
- `GET /api/firewall/filter/getRule/{uuid}` ist auf der Sense (26.7) **nicht**
  die Lesequelle: der Aufruf antwortet mit `[]`, egal ob die UUID existiert.
  Zustand und UUID kommen aus `POST /api/firewall/filter/searchRule`; dort
  stehen `uuid` (32 Hex) und bei modernen Regeln zusätzlich
  `@attributes.uuid` (gestrichelt). Immer normalisiert vergleichen.
- `toggleRule` ist ein **Toggle**, kein Setzen. Erst lesen, nur bei
  Abweichung schalten, `apply` rufen und den Zustand anschließend erneut
  lesen — sonst läuft ein Toggle auf eine falsche UUID still ins Leere.
- `POST /api/exammode` antwortet bei API-Fehlern mit dem neu gerenderten
  Panel (HTTP 200), nicht mit einem Fehlertext: Der Fehler gehört in das
  nicht wegklickbare Modal, der Schalter muss den echten Zustand zeigen.
  Nur „nicht konfiguriert" bleibt ein 400-Text.
- TLS gegen die Sense: Das GUI-Zertifikat ist `CN=sense.internal` mit SAN
  `DNS:sense.internal, IP:192.168.21.1`, signiert von der internen CA
  „uploadthing internal CA". Der CA-PEM liegt auf dem Dell
  (`~/certs/sense-ca.pem`) und wird Deno über `DENO_CERT` bekannt gemacht —
  keine Abschaltung der Prüfung, kein `--unsafely-ignore-certificate-errors`.
  `OPNSENSE_API_URL=https://sense.internal` (seit 2026-10-30 Port 443, kein
  `:8443` mehr). `Deno.createHttpClient` kennt in Deno 2.9 keine Option zum
  Abschalten der Prüfung (wird still ignoriert).
- Startfehler der Firewall beenden den Prozess **nicht** mehr. Wer
  `Deno.exit(1)` zurückbringt, macht die App auf jedem Host ohne
  API-Zugang unstartbar.
- Die Werte aus `~/sense.internal_root_apikey.txt` gehören nur in die
  Produktions-`.env` — nie ins Repo, nie in eine Testfixture, nie ins Log.
- Tests injizieren `fetch` (`test/helpers/opnsense_fixture.ts`); kein Test
  darf die echte Sense schalten.
- Since #131, startup releases the internet (exam mode off) instead of blocking it; without API credentials only the examstate reset runs. Startup examstate reset is not tied to the configuration.
- The examstate singleton persists across test runs; use `clearExamState()` (and `seedExamState()` for running/paused scenarios) from `test/helpers/forensics_fixture.ts` or tests will see leftovers from earlier runs.
- The student countdown receives `ends_at_ms` server-rendered and ticks client-side via Alpine; after a resume it stays behind the server until page reload (no polling by design).
- Browser-visible flows may also depend on local directories such as `ABGABEN_DIR` and `UNTERLAGEN_DIR` existing and being readable.

## Cookie Presence Semantics

- Do not treat a valid session cookie hit as a new `registrations` event.
- Current attribution for the admin forensics page comes from `cookiepresents`, while `registrations` remains a history of explicit registration actions.
- Runtime code should no longer depend on `forensic_registrations`; the current schema uses `cookiepresents` instead.
- Do not show known-IP card counts from total `ipfact` rows for an IP; the card count must come from the selected time window, currently `seen_at_desc.length`.
- Admin forensics timestamps on the IP cards use a fixed 15-hour cutoff via `localAdminIpString`, not the generic `TODAY_HOURS_CUTOFF` value.
- The admin anomaly panel belongs between the time selector and the known-IP report; if anomalies exist it should default to a collapsed Bootstrap accordion with warning styling in the header, and if none exist it should render the German-only empty state `Es gibt keine Anomalien.`.
- The Admin page now includes a database cleanup control that deletes rows older than one month from `cookiepresents`, `registrations`, `ipfact`, and `abgaben`; it is intentionally fixed-duration and not runtime-configurable.
- The anomaly panel must not be gated only by `anomalies.by_ip.length`; user-only anomalies are valid and the UI should treat `anomalies.by_user.length` as sufficient to render the panel.
- Registration-only multi-IP anomalies are expected on `/admin/students`; do not restrict anomaly detection to IPs that also have cookie presence in the selected range.
- The deterministic localhost forensic fixture helpers now live in `test/helpers/forensics_fixture.ts`; prefer named scenario setup there over ad-hoc SQL cleanup embedded directly in each test.
- HTMX network failures such as connection refused, DNS errors, and timeouts surface through `htmx:sendError` / `htmx:timeout`, not `htmx:responseError`, so toast handling in `templates/index.hbs` must listen to both paths.
- When using `gh issue comment` or `gh issue close --comment` from the shell, use a heredoc or `--body-file`/careful quoting; unescaped backticks in inline shell strings trigger command substitution and produce noisy but harmless shell errors.
- When validating admin forensics performance work, run `EXPLAIN QUERY PLAN` against the real local `uploadthing.db`, not only against assumptions from the schema. The useful verification commands in this cycle checked these exact query families: `SELECT DISTINCT ip FROM ipfact WHERE seen BETWEEN ...`, `SELECT seen FROM ipfact WHERE ip = ? AND seen BETWEEN ... ORDER BY seen DESC`, latest-by-IP lookups for `cookiepresents` and `registrations`, latest-by-user lookup for `registrations`, user/range queries for `abgaben`, and the range aggregation reads introduced for `service/ipadmin.ts`.
- The range-based admin aggregation originally used `ORDER BY ip ASC, at/seen DESC`, but `EXPLAIN QUERY PLAN` showed temp b-tree sorting on those shapes; the final implementation removes unnecessary global ordering from `cookiepresents`, `registrations`, and `abgaben` range reads, changes `ipfact` range reads to `ORDER BY seen DESC`, and sorts each per-IP bucket in memory inside `service/ipadmin.ts`.

## Theme Asset Workflow

- Do not edit `/static/theme.css` when switching visual themes; it is meant to stay a direct copy from `color-tool`.
- Do not use the old generated variable-only `static/bootstrap.css`; uploadthing needs the full Bootstrap stylesheet or the Bootstrap component classes render almost unstyled.
- Uploadthing-specific adaptation belongs in `/static/ui-shell.css`.
- The installed theme background images must use the generic filenames `/static/img/bg-light.jpg` and `/static/img/bg-dark.jpg`.
- The light/dark toggle must not swap CSS files at runtime; only the background image and `data-bs-theme` mode should change.
- The admin theme selector must do a normal full-page POST/response cycle, not an HTMX partial swap, because applying a new theme needs the page head to re-render with the new asset-version query string.
- Only offer theme directories that contain all three required files: `theme.css`, `bg-light.jpg`, and `bg-dark.jpg`.
- Do not reintroduce the old local CSS stack unless there is a deliberate architectural reason; the goal is to stay close to Bootstrap plus the color-tool files.
- Avoid defining app-owned palette variables in `/static/ui-shell.css`; use Bootstrap/color-tool variables directly so the imported theme continues to control color and contrast.
- Bootstrap-aware theming depends on Bootstrap-aware markup; generic glass wrappers alone do not pick up the intended component styling from `bootstrap-overrides.css`.

## Bootstrap Utility Specificity

- Bootstrap 5 utility classes like `p-2`, `m-3`, etc. use `!important`, so they silently override any custom CSS rule targeting the same property on the same element.
- Do not combine Bootstrap shorthand padding/margin utilities with axis-specific custom properties on `#main-wrapper` or similar layout elements; prefer axis-specific utilities (`px-2 pb-2`) and let `ui-shell.css` own the remaining axis.
- When debugging unexpected spacing, check for Bootstrap utility `!important` overrides first.
- Flex rows with fixed-size avatar/badge elements need an explicit flexible text region or content-driven card width; otherwise non-shrinking items can push trailing badges outside the card.
- Renaming template IDs is easy to miss because HTMX targets/includes, JS selectors in `templates/index.hbs`, and shell CSS selectors can all depend on them; always grep for `#old-id` before changing a one-off element ID.

## Generated Artifacts

- `drizzle/meta/` (journal + snapshots) and `drizzle/*.sql` are versioned in
  the repo — they are the schema history. Do not delete or regenerate them;
  a new migration is added, an applied one never changes.
- `__drizzle_migrations` is the only schema state the app trusts. A stale
  `_prisma_migrations` table may still exist in old databases; nothing reads
  it, and it is not evidence about the current schema.
- Do not reintroduce legacy agent scaffold artifacts such as `.openclaw/`, `memory/`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `HEARTBEAT.md`, or `TOOLS.md`; durable project knowledge belongs in `docs/ai/` instead.

## Download Filename Truncation

- Der Download-Dateiname der Abgaben wird aus `new Date().toISOString()`
  gebaut und dann `slice(0, 16)` genommen (`routes/admin.ts`, um Zeile
  422): `2026-04-29_09-37`. Ein `slice(0, 15)` schneidet die letzte Ziffer
  der Minute ab (`09-3`) — 2026-10-30 behoben, der Test deckt es ab.
- Lehre: bei Zeitstempeln im Dateinamen die **Länge des gewünschten
  Formats** ausrechnen, nicht raten; `toISOString()` liefert
  `YYYY-MM-DDTHH:MM:SS.sssZ`, der Teil bis zur Minute sind 16 Zeichen.

## Test Isolation Pitfall

- The test suite runs against the real `uploadthing.db`, not an isolated test database.
- If a developer is logged in locally (e.g., via `localhost:8000`), their session data and registrations remain in the database and can cause flaky test failures, especially for anomaly detection tests.
- When running `deno task test`, ensure you have no active local sessions or registrations that could interfere with test assertions.
- The test user "grafg@spengergasse.at" is hardcoded in endpoint tests; do not use this email for local development sessions.

## HTMX Attribute Inheritance Traps

- `hx-select` inherits from parent elements down to children. A child's HTMX request will filter its response through a parent's `hx-select`, even if the selector is meaningless for the child's endpoint. This caused the IP detail modal to be empty because `hx-select="#admin-report-panel > *"` on the section filtered the `/admin/ip-detail` response to nothing.
- `hx-disinherit` must be placed on an ANCESTOR of the elements that should not inherit, not on the elements themselves. HTMX's `getAttributeValueWithDisinheritance` has a guard `initialElement !== ancestor` that skips the disinherit check on the starting element. Placing `hx-disinherit` on the card itself is silently ignored; place it on the parent `<div.row>` or `<div.col>` wrapper instead.
- `hx-on:` with camelCase event names (e.g., `hx-on::afterSwap`) breaks because HTML attribute names are case-insensitive and get lowercased by the browser to `hx-on::afterswap`. HTMX tries to match against the dispatched event (`htmx:afterSwap`) and fails. Always use kebab-case event names: `hx-on:htmx:after-swap`.
- `htmx:afterSwap` fires on the swap TARGET elements (the content being swapped in), NOT on the requesting element. The event bubbles up from the target, so a listener on the card element (which is not an ancestor of the target) will never receive it. For per-request handling, use `htmx:afterRequest` (fires on the requesting element) or listen on `document` with a target-ID check.

## Bootstrap JS Missing

- The project had `bootstrap.css` (CSS only) but never loaded Bootstrap's JavaScript. `bootstrap.Modal`, `bootstrap.Tooltip`, etc. were all `undefined`. Bootstrap modals, tooltips, and `data-bs-*` dismiss attributes require loading `bootstrap.bundle.js`.
- All external libraries in `static/` must be non-minified for auditability and debugging. Use symlinks from the generic name to the versioned name (e.g., `htmx.js` → `htmx-2.0.10.js`).

## Missed Count After Submission

- The `missed_count` calculation in `service/ipadmin.ts` previously counted ongoing absence after the last scan, even if the student had already submitted their work and left. A student who leaves after submitting should not be penalized; scans after their most recent submission are excluded from `missed_count`.

## App-Start beendet den Prozess bei Firewall-Fehler (behoben in #142)

- `runExamModeOnStartup()` rief früher `setInternetActive(true)` und machte
  `Deno.exit(1)`, wenn das Kommando scheiterte. Solange `EXAMMODE_COMMAND` auf
  `/usr/local/sbin/exammode.sh` zeigte, startete die App **nur auf der Sense** —
  auf jedem anderen Host brach sie beim Boot ab.
- Seit #142 gilt das Gegenteil: ein fehlgeschlagener API-Aufruf wird geloggt,
  die App startet weiter, und das Panel zeigt den echten Firewall-Zustand.
  Diese Gutmütigkeit nicht zurückdrehen.

## MikroTik-Scanner scheiterte still

- Der OPNsense-Cronjob rief `/root/bin/scan.py` (Symlink auf `scan-tik.py`).
  Nach einer Kopie mit Modus `644` und ohne die referenzierte Passwortdatei
  schlug er **jede Minute** fehl („Permission denied"), ohne dass es jemandem
  auffiel — `ipfact` lief sieben Tage leer.
- Lehre: externe Datenerfassung braucht einen sichtbaren Frische-Indikator im
  Admin-Panel, nicht nur ein Logfile. Umsetzung in #145.

## Drizzle-Migrationen

- `drizzle-kit` läuft **nur auf dem Entwicklungsrechner** (`deno task
  db:generate`). Auf der Appliance gibt es kein Node und kein esbuild; dort
  migriert `lib/migrate.ts` über `@db/sqlite`.
- Die Baseline `drizzle/0000_baseline.sql` ist absichtlich idempotent
  (`IF NOT EXISTS`). Sie wird auf einer bestehenden Datenbank **nicht
  ausgeführt**, wenn alle Objekte vorhanden sind — der Runner verbucht sie
  nur in `__drizzle_migrations`. Fehlt etwas, führt er sie aus und gleicht
  die Datenbank an. Wer die `IF NOT EXISTS`-Guards entfernt, macht den Start
  auf jeder bestehenden Installation kaputt.
- Das Journalformat muss Drizzles Format bleiben (`hash` = SHA-256 über den
  rohen Dateiinhalt, `created_at` = Journal-`when` in ms, Tabelle
  `__drizzle_migrations` mit `id SERIAL PRIMARY KEY`). Weicht der Runner ab,
  sieht `drizzle-kit migrate` auf dem Entwicklungsrechner einen anderen
  Stand als die Appliance.
- `@db/sqlite` schneidet INTEGER-Werte über 2^31 **beim Lesen** auf int32 ab
  (`1793390210849` kommt als `-1906118879` zurück). Gespeichert wird korrekt,
  aber der Runner vergleicht deshalb nur Hashes und liest `created_at` nie
  für Logik. Wer migrierte Zeitstempel prüfen will, nimmt
  `CAST(created_at AS TEXT)`.
- Kennt die Datenbank eine Migration, die der Programmstand nicht hat,
  verweigert der Start mit deutscher Meldung. Das ist Absicht: kein halb
  migriertes Schema, kein automatisches Zurück. Rollback ist das Backup
  (#148).
- Nach der Baseline (Stand 2026-10-30) nutzen die vier Forensik-Hot-Queries
  ihre Composite-Indizes — geprüft mit `EXPLAIN QUERY PLAN` auf einer Kopie
  der Produktionsdatenbank:
  - `cookiepresents` `WHERE ip = ? AND at BETWEEN ? AND ? ORDER BY at DESC`
    → `SEARCH cookiepresents USING INDEX cookiepresents_ip_at_idx`
  - `registrations` dito → `USING INDEX registrations_ip_at_idx`
  - `abgaben` dito → `USING INDEX abgaben_ip_at_idx`
  - `ipfact` `SELECT DISTINCT ip … WHERE seen BETWEEN ? AND ?`
    → `USING COVERING INDEX ipfact_seen_ip_idx` (+ temporärer B-tree für
    DISTINCT, wie vorher)

## MikroTik-Polling (seit #145)

- Die IP-/MAC-Erfassung läuft im App-Prozess (`service/tik.ts`), nicht
  mehr über einen HTTP-Endpunkt. `POST /activeips`, `ACTIVEIPS_ALLOWED_IPS`
  und der OPNsense-Cronjob sind Geschichte — wer sie wieder einführt,
  baut einen toten, ungeschützten Meldeweg.
- Der Tik wird **nur gelesen**. Der User ist read-only; im Code darf kein
  `/rest/.../set`, `reboot` oder ähnlicher Schreibpfad auftauchen.
  `TIK_PASSWORD` steht ausschließlich in der `.env` und nie in Logs,
  Fehlermeldungen, Fixtures oder Commit-Messages.
- `TIK_URL`, `TIK_USER` und `TIK_PASSWORD` sind gemeinsam oder gar nicht
  gesetzt. Eine halbe Konfiguration ist ein Startfehler, keine stille
  Abschaltung.
- Fehler und Leerlauf sind zwei Zustände: Der Poller merkt sich
  `last_success_at`, `last_attempt_at`, `last_count` und `last_error`;
  das Admin-Panel zeigt „nicht erreichbar" getrennt von „keine Clients
  verbunden". Ein Ausfall darf nie wie ein leeres WLAN aussehen.
- `ipfact.mac` ist nullable: ältere Zeilen und Clients ohne lesbare MAC
  bleiben gültig. Die MAC wird kleingeschrieben gespeichert; die
  MAC-Freigabe (#147) baut darauf auf, nicht auf einer zweiten Tabelle.
- Kein Test ruft den echten Tik auf: `fetch` wird injiziert, der Poller
  wird in Tests nicht gestartet, und `scripts/test-with-server.sh` setzt
  `TIK_*` leer, damit der Testserver nicht echte Clients in die Test-DB
  schreibt.
- Beim Shutdown wird zuerst der Poller gestoppt (`stop()` bricht den
  laufenden Abruf ab und wartet ihn ab), dann das SQLite-Handle
  geschlossen. Sonst schreibt ein spätes Poll-Ergebnis in eine bereits
  geschlossene Datenbank.

## Gitignorierte Live-Snapshots tragen Klartext-Secrets

- `appliance/current/` ist bis auf `config.redacted.xml` gitignored und
  sammelt rohe Kopien von der Appliance. In
  `appliance/current/root/examsense/bin/scan-tik.py` lag das Tik-Passwort
  im Klartext, ebenso in `appliance/current/config.xml` (unredigiert).
- Lehre: `git grep` findet diese Dateien **nicht** — wer Secrets sucht,
  muss zusätzlich `git status --ignored` bzw. ein `grep -r` über das
  Arbeitsverzeichnis laufen lassen. Snapshot-Verzeichnisse nie als
  „harmlos, weil ungetrackt" abtun, und Belegdateien nur redigiert
  übernehmen.
- **2026-10-30 nachgezogen:** `appliance/current/config.xml`, `usr/` und
  das alte `MANIFEST` sind gelöscht (der Klartext ist durch das
  gpg-Chiffrat aus #148 ersetzt).

## config.xml-Redaktion deckte API-Keys nicht ab

- `appliance/bin/redact-opnsense.sed` ersetzte nur `<password>` und
  `<prv>`. `<apikeys>` (OPNsense speichert dort `<key>|<hash>`) blieb
  stehen — und `appliance/current/config.redacted.xml` ist **getrackt**
  und das Repo ist **öffentlich**. Bis 2026-10-30 lagen damit die
  API-Key-Hälften (inklusive des Root-Keys) im Klartext im Repo.
- Die Filterliste deckt jetzt zusätzlich `<apikeys>`, `<ldap_bindpw>`,
  `<bindpw>`, `<pre-shared-key>` und `<community>` ab.
- **Lehre:** Ein Redaktionsfilter ist eine **Allowlist-Umkehrung**: jede
  neue Secret-Art in OPNsense (`config.xml`) muss dort eingetragen
  werden. Nach jedem neuen Snapshot `grep -E '\$2y\$|<apikeys>[A-Za-z0-9]'`
  laufen lassen, bevor committet wird.

## CSVListField will einen String, kein Array (OPNsense-API)

- `POST /api/auth/user/set/{uuid}` mit `{"user":{"priv":["page-filter-api"]}}`
  endet in `{"errorMessage":"Unexpected error, check log for details"}` —
  ohne PHP-Log, also nicht diagnostizierbar. Mit
  `{"user":{"priv":"page-filter-api"}}` (Komma-String) liefert derselbe
  Aufruf `saved`.
- Betroffen sind alle `CSVListField`-Felder der Modelle. Für
  Mehrfachwerte komma-separiert senden, nicht als JSON-Array.
- `POST /api/auth/user/add` verlangt `name` und `password`; ein
  mitgesendetes `priv`-Array lässt den ganzen Aufruf scheitern. Erst
  minimal anlegen, dann `set` mit dem Komma-String.

## Unbound beantwortet DNS, dnsmasq bedient nur DHCP

- `sockstat -4 -l | grep :53` zeigt ausschließlich `unbound`; dnsmasq
  lauscht auf `:67` (DHCP). Host-Einträge unter
  `/api/dnsmasq/settings/searchHost` sehen im GUI wie DNS aus, werden
  aber nicht aufgelöst — `tst.spengergasse.at` und `dell.internal`
  kommen aus `/api/unbound/settings/searchHostOverride`.
- Trotzdem sind die dnsmasq-Einträge nicht wirkungslos: ein Eintrag mit
  `hwaddr` ist eine **DHCP-Reservierung**. Der `dell`-Eintrag zeigte auf
  die WLAN-MAC des Dell und hätte bei WLAN-Betrieb `.2` ein zweites Mal
  vergeben — bei statischer Adresse auf dem gelben Interface ein
  Adresskonflikt. Seit 2026-10-30 trägt er die MAC des USB-Adapters
  (`7c:c2:c6:15:cb:a8`).

## `.section-heading` ist nur in einem Theme gestylt

- Die Templates benutzen `class="section-heading text-uppercase"` als
  Abschnittsüberschrift, aber die Klasse ist ausschließlich in
  `static/leisure-pink-theme.css` definiert. In allen anderen Themes ist
  sie wirkungslos — das Element erbt einfach die `h4`/`h5`-Standardgröße.
- Neue Layouts deshalb auf Bootstrap-Utilities (`h6 text-uppercase
  text-body-secondary`) stützen, nicht auf `.section-heading`. Wer die
  Klasse mit Bedeutung füllt, muss sie in `theme.css`/`ui-shell.css`
  global definieren, nicht in einem einzelnen Theme.

## Serverseitig gerenderte Panels veralten (#160)

- Ein Panel, das `exam_open` beim Rendern einmal auswertet, bleibt stehen,
  bis der Nutzer die Seite neu lädt. Wenn eine Aktion davon abhängt, muss
  das Panel sich selbst nachziehen — hier per `GET /abgabe-panel` bei
  Hover und Klick.
- **Ein Hover-Trigger, der sein eigenes Ziel austauscht, braucht
  `throttle`.** Der Swap ersetzt den Knoten unter dem Cursor; Chrome feuert
  auf den neuen Knoten ein `mouseenter`, und ohne `throttle:3s` dreht das
  eine Request-Schleife.
- **Trigger-Attribute gehören nur in den Zustand, in dem sie gelten**
  (`{{#unless exam_open}}`): ein Hover-Swap bei offenem Formular würde die
  im `<input type="file">` gewählte Datei verwerfen.
- **Jeder Panel-Swap braucht `Alpine.initTree`.** Der afterSwap-Handler in
  `index.hbs` initialisierte nur `#app-content`; nach einem Swap von
  `#abgabe-panel` stand der Countdown still und der Dateiname blieb beim
  Platzhalter. Neue Swap-Ziele mit `x-data` dort ergänzen.
- `cursor-pointer` ist **keine** Bootstrap-5.3-Utility. Sie ist in
  `static/ui-shell.css` definiert; wer eine neue Cursor-Utility braucht,
  legt sie dort an, nicht als Inline-Style.

## `/admin/students` rastet den Zeitraum auf Schulstunden ein

- Ohne `starttime`-Query nimmt die Route `now - 90 min` und zieht den Wert
  auf den nächstkleineren Eintrag aus `config.spg_times`; `endtime` wird
  gleich `starttime` gesetzt. Läuft der Test vor der ersten Schulstunde
  (abends/nachts), liegt das Fenster dadurch **in der Zukunft** — eben
  geschriebene `ipfact`/`registrations`-Zeilen fallen heraus und
  Anomalie-Tests scheitern reproduzierbar.
- Tests, die auf geseedeten Zeitstempeln aufbauen, geben den Zeitraum
  deshalb explizit mit (`startdate`/`starttime`/`enddate`/`endtime`).

