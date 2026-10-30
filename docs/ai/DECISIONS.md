# DECISIONS

## 2026-10-30: Eine Schülerseite — Anmeldung und Abgabe auf `/` (#146)

- **Eine Seite, kein Navigationsbutton.** `/` zeigt links die Angaben
  (immer vollständig, nichts abgeschnitten) und darunter die festen
  Doku-Links in einem eigenen Scrollbereich (`#doku-list`), rechts
  Anmeldung bzw. Abgabe (`#abgabe-panel`). Schüler sehen keine
  Navigation, nur einen kleinen „Abmelden"-Link; Admins behalten die
  volle Navigation. `GET /upload` leitet auf `/` um, `POST /upload`
  liefert das Panel zurück.
- **Die Suche war das Problem, nicht der Button.** Ein Feld, Filter
  `(|(givenName=…*)(sn=…*)(mail=…*)(sAMAccountName=…*))`, ab drei
  Zeichen. Angezeigt wird „Vorname Nachname · Klasse" aus `givenName` +
  `sn` — **nicht** `displayName` (der ist invertiert) und ohne E-Mail.
  Der Suchwert wird nach RFC 4515 maskiert (`lib/ldap_filter.ts`).
- **Die Suche schreibt nichts mehr.** `registerManyUsers` und
  `repo.users.upsertMany` sind entfernt; registriert wird erst beim Klick
  auf einen Treffer (`service.ldap.resolveLoginUser`: LDAP zuerst, damit
  Name und Klasse aktuell sind, lokaler Datensatz als Fallback bei
  LDAP-Ausfall).
- **Anmeldesperre im Examen.** Während `service.exam.isExamWindowOpen()`
  gilt, wird eine Neuanmeldung als Nicht-`LehrendeR` mit deutscher
  Meldung in derselben Spalte abgelehnt. Die Entscheidung fällt nach dem
  LDAP-Lookup — die Klasse ist vorher unbekannt, und die Mail-Endung sagt
  nichts über die Rolle. Lehrpersonen sind ausgenommen, sonst käme der
  Lehrer bei Sessionverlust nicht mehr hinein.
- **Notausgang nur im Speicher.** `service.exam.openRegistrationWindow()`
  öffnet für 5 Minuten; die Freigabe ist prozesslokal (kein DB-Feld),
  verfällt nach Ablauf und wird bei Exam-Start und Exam-Ende
  zurückgesetzt. Endpunkt: `POST /api/exam/registration-window` mit
  `action=open|close`; der Knopf steht für Admins unter dem Formular,
  solange ein Examen läuft.
- **Erfolg als Toast, Formular bleibt.** Nach einer Abgabe antwortet
  `POST /upload` mit dem Panel und einem `#abgabe-toast`-Datenattribut;
  der globale afterSwap-Handler zeigt den Toast. Ein `HX-Trigger`-Header
  wäre verloren gegangen, weil der auslösende Button beim Swap ersetzt
  wird. Nur der klassische (Nicht-HTMX-)POST bekommt die Erfolgsdaten
  als Alert im Panel — es gibt keine eigene Erfolgsseite mehr.
- **Stabile IDs für die Playwright-Suite:** `#abgabe-form`,
  `#angaben-list`, `#login-form`, `#exam-countdown`.

## 2026-10-30: Admin-Freigabe per MAC neben der LDAP-Klasse (#147)

- **Die LDAP-Klasse bleibt die Rolle, die MAC ist der Gerätenachweis.**
  Admin ist man ausschließlich über `klasse === "LehrendeR"`
  (`service/user.isTeacher()`). Die MAC-Allowlist entscheidet nur, *von
  welchem Gerät* sich eine Lehrperson anmelden darf: Ein `LehrendeR` von
  einer IP aus `ADMIN_IPS` **oder** von einer freigegebenen MAC kommt
  durch, auch wenn die IP nicht in `ADMIN_IPS` steht. Ein Schüler von
  einer freigegebenen MAC wird **nicht** Admin — die Klasse schlägt nicht
  um.
- **MAC-Spoofing ist trivial.** Die Freigabe ist Komfort („Lehrender von
  diesem Gerät"), keine Sicherheitsgrenze. Wer MAC-Adressen fälschen kann,
  umgeht sie; die Identitätsprüfung im Examen bleibt die visuelle
  Kontrolle durch die Lehrperson plus das signierte Session-Cookie.
- **Zwei Quellen, eine Semantik.** Die DB-Tabelle `adminmac` (gepflegt
  unter `/admin/application`, Migration `0002_adminmac`) ist die
  dauerhafte Liste; `ADMIN_MACS` aus der Env ist die Übergangslösung, weil
  die Einträge dort schon stehen. Fehlt `ADMIN_MACS` oder ist sie leer,
  gibt es keine Env-Freigabe — **kein** Startfehler. Ein Eintrag, der keine
  MAC-Adresse ist, bricht den Start dagegen mit deutscher Meldung ab: ein
  Tippfehler würde eine Freigabe sonst still unwirksam machen.
- **Kanonische Schreibweise.** Gespeichert, verglichen und angezeigt wird
  `aa:bb:cc:dd:ee:ff` (klein, Doppelpunkte, `lib/mac.ts`). Eingaben mit
  `-`, `.`, Leerzeichen, Großschreibung oder als 12-Hex-Block werden
  normalisiert; alles andere wird mit deutscher Meldung abgelehnt.
- **MAC zur IP kommt aus `ipfact`, nie aus einem Tik-Abruf im Request.**
  `repo.ipfact.getLatestMacForIP()` liest die jüngste Sichtung mit MAC
  (Index `ipfact_ip_seen_key`) — die Daten liegen durch das Polling (#145)
  vor. Ein nicht erreichbarer Tik darf keinen Login aufhalten und kein
  Request darf fünf Sekunden Wartezeit erben. Folge: Ein gerade erst
  verbundenes Gerät ist erst nach dem nächsten Poll (60 s) per MAC
  freigegeben.
- **Die Login-Sperre bleibt im Login.** `is_admin` im Session-Middleware
  hängt weiterhin nur an der Klasse. Eine laufende Admin-Sitzung wird nicht
  bei jedem Request gegen die MAC-Liste geprüft, damit ein ausgefallenes
  Polling niemandem mitten im Examen die Admin-Rechte entzieht.
- **`ADMINS` entfällt.** Die Variable wurde im TypeScript nie gelesen und
  ist aus `.env.example`/`.env.local` und der Doku entfernt; eine
  E-Mail-Allowlist für Admins gibt es damit nicht.

## 2026-10-30: Tik-Polling im App-Prozess statt Loopback-Endpunkt (#145)

- **Die App liest die WLAN-Registrierungstabelle selbst.** `service/tik.ts`
  ruft `GET /rest/interface/wireless/registration-table` mit
  `.proplist=last-ip,mac-address,uptime,interface` per HTTP Basic ab —
  beim Start sofort, danach alle 60 s. Kein Cronjob, kein externes Skript,
  kein `POST /activeips`.
- **Nur Lesen.** Der Tik-User ist auf `read`/`rest-api` beschränkt; der
  Code kennt keinen Schreibpfad (`set`, `reboot`, …). Das Passwort steht
  ausschließlich in der `.env` und erscheint in keiner Fehlermeldung.
- **Konfiguration ist dreifach oder gar nicht.** `TIK_URL`, `TIK_USER` und
  `TIK_PASSWORD` sind gemeinsam gesetzt (Polling aktiv) oder alle leer
  (Polling aus, Panel zeigt „nicht konfiguriert"). Eine halbe Konfiguration
  bricht den Start mit deutscher Meldung ab — dasselbe Muster wie
  `OPNSENSE_API_KEY`/`_SECRET`.
- **Fehler ≠ Leerlauf.** Der letzte Abrufzustand (Zeitpunkt, Anzahl,
  Fehler) liegt im Speicher und wird im Admin-Panel gerendert:
  „MikroTik erreichbar", „Tik erreichbar · keine Clients verbunden",
  „MikroTik nicht erreichbar" (mit „keine IP-Daten seit X") und
  „nicht konfiguriert" sind getrennte Zustände.
- **MAC je Sichtung.** `ipfact` bekommt eine nullable `mac`-Spalte
  (Drizzle-Migration `0001_ipfact_mac`); die MAC-Freigabe selbst ist #147.
- **Der Endpunkt wird gelöscht, nicht stillgelegt.** `routes/machine.ts`,
  `ActiveIpsSchema` und `ACTIVEIPS_ALLOWED_IPS` sind entfernt — ein toter
  Endpunkt mit IP-Whitelist wäre Angriffsfläche ohne Nutzen.
- **Tests injizieren `fetch` und starten keinen Poller.** Das
  Test-Startskript setzt `TIK_*` leer, damit der Testserver nie echte
  WLAN-Clients liest oder in die Test-DB schreibt.

## 2026-10-30: OPNsense-API-Client für die Exam-Sperre (#142)

Konkretisiert die Entscheidung aus dem Epic #141 nach den ersten echten
Aufrufen gegen die Sense (26.7).

- **Lesen über `searchRule`, nicht über `getRule/{uuid}`.**
  `GET /api/firewall/filter/getRule/{uuid}` antwortet auf der Sense mit
  `[]` — unabhängig davon, ob die UUID existiert. Zustand und UUID kommen
  deshalb aus `POST /api/firewall/filter/searchRule` (eine Antwort,
  Regeln inkl. deaktivierter).
- **Toggle statt Setzen.** `POST /api/firewall/filter/toggleRule/{uuid}`
  ist ein Toggle. Der Client liest zuerst, schaltet nur bei Abweichung,
  ruft `apply` und liest den Zustand erneut zur Bestätigung. Ein bereits
  passender Zustand ist ein Erfolg ohne Schreibzugriff.
- **UUID-Normalisierung.** `searchRule` liefert 32 Hex-Zeichen,
  moderne Regeln führen zusätzlich `@attributes.uuid` im gestrichelten
  Format. Verglichen wird normalisiert; für `toggleRule` wird die von der
  API gelieferte UUID verwendet. Die UUID selbst steht in
  `OPNSENSE_EXAMMODE_RULE_UUID`, nicht im Code.
- **`OPNSENSE_API_URL` ist Pflicht, sobald Credentials gesetzt sind.**
  Die API-Adresse ist Betriebswissen (IP vs. Hostname) und gehört
  ebenfalls in die `.env`; Key und Secret bleiben beide-oder-keins.
- **TLS bleibt geprüft.** Deno 2.9 kennt keine Option mehr, die
  Zertifikatsprüfung pro Request abzuschalten (`Deno.createHttpClient`
  ignoriert `unsafelyDisableCertificateVerification` stillschweigend).
  Weil die Sense auf der API-Adresse ihr GUI-Zertifikat für
  `tst.spengergasse.at` präsentiert, gilt: entweder eine `OPNSENSE_API_URL`
  verwenden, die das Zertifikat abdeckt, oder den Prozess host-beschränkt
  mit `--unsafely-ignore-certificate-errors=<api-host>` starten. Keine
  stille Abschaltung im Code.
- **Fehler werden im Panel gezeigt, nicht als Toast.** Scheitert eine
  Aktion (`/api/exammode`, `/api/exam/start`, `/api/exam/stop`), rendert
  die Route das Panel mit dem echten Firewall-Zustand und dem API-Fehler
  (HTTP 200). Nur „nicht konfiguriert" bleibt ein 400-Text. Das Modal ist
  nicht wegklickbar und hat als einzigen Knopf „Erneut sperren".
- **Startup ist fehlertolerant.** `runExamModeOnStartup()` loggt einen
  API-Fehler und startet weiter; kein `Deno.exit(1)` mehr. Der alte
  Subprozess-Pfad (`Deno.Command`, `defaultExamModeRunner`,
  `EXAMMODE_COMMAND`, `INTERNET_ACTIVE`) ist entfernt.

## 2026-10-30: Exam-Infrastruktur — API-only, App verlässt die Sense

Ersetzt den früheren Abschnitt „Appliance Structure: current/ + rollout/"
(2026-10-21). Getrackt in Epic #141.

- **Firewall-Steuerung ausschließlich über die OPNsense-API**
  (`POST /api/firewall/filter/toggleRule/{uuid}` + `apply`,
  `GET …/getRule/{uuid}`), Credentials als `OPNSENSE_API_KEY`/`_SECRET` in
  `.env`. Kein `sudo`, kein Host-Skript, kein Schreiben in
  `/conf/config.xml`. Die Regel-UUID steht in der Konfiguration, nicht im Code.
- **IP-Präsenz kommt per REST aus dem MikroTik** in den App-Prozess
  (`registration-table`, 60 s). `POST /activeips` und die Scanner-Skripte
  entfallen — der frühere Cronjob auf der Firewall war ein Umweg über
  Loopback-HTTP und Root-Skripte.
- **Die App verlässt die Sense.** Dell = Hypervisor (VirtualBox) + App als
  systemd-Dienst, Sense = Firewall/DNS/DHCP. Damit entfallen `rc.d`,
  `startloop.sh` und der PIDfile-Status-Quirk; die App ist nicht mehr hinter
  der Firewall, sondern ein Peer im Prüfungsnetz.
- **Kein Polling des Firewall-Zustands.** Der Zustand wird beim Rendern des
  Admin-Panels und bei Aktionen gelesen; Drift wird sichtbar gemacht
  („Examen läuft · Internet frei"), aber nicht automatisch geheilt.
- **Exam-Start sperrt implizit** und schreibt `examstate` auch dann, wenn die
  Sperre scheitert — der Schalter zeigt dann den echten Zustand, ein Modal
  nennt den API-Fehler.
- **App-Start bleibt fail-safe:** `examstate` → `stopped`, Internet frei.
  Bewusst akzeptiert: ein Absturz während des Examens öffnet das Netz.
- **`appliance/rollout/` wird nicht gebaut.** Nach dem Cleanup (#144)
  bleiben `usb_persist.conf`, `redact-opnsense.sed`, das MikroTik-Material,
  der redigierte Snapshot, die Legacy-Regel-CSV und Doku; verschlüsselte
  Config-Backups (gpg/pass, nie Klartext im public Repo) kommen dazu.
- **Tik-Zugang:** eigener User mit `read` + `rest-api`, auf die App-IP
  beschränkt. Passwörter nie im Repo — auch nicht in der History.
- **Runtime bleibt Deno, htmx bleibt 2.0.10** bis Februar 2027; die
  Node-Frage wird nach der Saison neu gestellt.

## Single-Repo Exam System (appliance/ Integration)

- The sister repo `examsense` (OPNsense/FreeBSD appliance scripts:
  exammode, scan helpers, rc.d service, redacted config snapshots,
  MikroTik artifacts) was merged into this repository as `appliance/`
  (2026-10-16); `georgernstgraf/examsense` is archived (read-only) on
  GitHub.
- Import method: squashed subtree (`git subtree add --prefix=appliance
  --squash`), deliberately not full-history — the old history stays
  queryable in the archived repo.
- Examsense documentation was consolidated, not duplicated: operational
  guidance lives in `docs/ai/OPERATIONS.md` ("Appliance-Artefakte"), script
  conventions in `docs/ai/CONVENTIONS.md` ("Appliance Scripts");
  `appliance/README.md` and `appliance/AGENTS.md` are thin pointers.
- The examsense Makefile target lives on as `config-snapshot` in the
  root Makefile; it runs **on the appliance** (source is
  `/conf/config.xml`), not on the dev machine.
- `appliance/files/` filenames map 1:1 to OPNsense system paths
  (slashes replaced by underscores); renaming requires a deployment
  migration note.

## Native TLS, No Proxy

- uploadthing is itself the TLS endpoint via `Deno.serve` (`cert`/`key` options); no reverse proxy is put in front.
- TLS is opt-in: `TLS_CERT_PATH` and `TLS_KEY_PATH` must be set together (fail-fast, German error) — unset means plain HTTP, unchanged behavior.
- The certificate source is the Let's Encrypt harvest on the school host `kik` (internal repo KI-Kustodiat-intern issue #3; uploadthing issue #136 is linked as its sub-issue). Certificates are copied manually via `scp`; after each copy the service restarts, since Deno reads cert/key at startup.
- Seit #143 terminiert die App selbst auf **443** auf dem Dell
  (User-Unit, `ip_unprivileged_port_start=443`), mit den von der Sense
  kopierten Let's-Encrypt-Dateien unter
  `~/certs/tst.spengergasse.at/`. Die frühere Sense-Topologie
  (Loopback 8000, GUI 8443, DNAT 443→8000) ist in `HISTORY.md` archiviert.

## Deno-First Execution

- The project uses Deno tasks and Deno runtime APIs as the primary execution model.
- Even when npm packages are imported, they are resolved through Deno's package support, not a Node package install workflow.

## Layered Web App

- The application is organized as middleware -> routes -> service -> repo -> database to separate HTTP concerns, business logic, and persistence.
- `main.ts` mounts routers and middleware, while `service/service.ts` and `repo/repo.ts` act as aggregators.

## Server-Rendered UI

- The frontend is intentionally server-rendered with Handlebars templates and Bootstrap, with HTMX-style partial responses for lighter interactions.
- This keeps the exam workflow simple, fast to load, and easy to operate in constrained environments.

## Manual Theme Deployment

- Uploadthing uses a fixed theme infrastructure derived from `color-tool`, but deployed as static assets inside `uploadthing/static/`.
- `/static/bootstrap.css` must be the full Bootstrap 5.3.8 stylesheet, not just a generated palette-variable file.
- Users can only toggle light versus dark mode for the currently installed theme.
- The active palette is shipped as a generic `/static/theme.css` file that should remain a direct copy of a color-tool theme CSS.
- Theme replacement is an administrator task: replace `/static/theme.css` plus `/static/img/bg-light.jpg` and `/static/img/bg-dark.jpg`, then recommit.
- Uploadthing keeps only one small local shell stylesheet, `/static/ui-shell.css`, on top of the color-tool stack.
- The old multi-file local CSS layer (`base.css`, `theme-bridge.css`, `utilities.css`, `components.css`) is intentionally removed.
- `ui-shell.css` should stay structural and behavioral; palette and contrast decisions should come from Bootstrap variables and the imported color-tool files rather than app-owned color overrides.
- Theme switching is now an admin-side runtime copy operation from `themes/<key>/` into the generic targets under `static/`, rather than a user-facing CSS-file switcher.
- Theme asset URLs are versioned with the runtime `THEME_ASSET_VERSION` value so a just-applied theme invalidates cached `theme.css` and background images on the next full-page render.
- The admin theme selector uses the git-tracked source files in `themes/<key>/` as the source of truth and copies them into the unmanaged generic targets under `static/`.

## Router Split: API Under /api, keine Machine-Route mehr

- `apiRouter` is mounted only under `/api`.
- Seit #145 gibt es **keinen** `machineRouter` mehr: `POST /activeips` und
  `ACTIVEIPS_ALLOWED_IPS` sind entfernt, die IP-/MAC-Daten holt der Prozess
  selbst vom MikroTik (`service/tik.ts`).
- Die frühere Doppel-Mounting (`/` und `/api`) ist entfallen; die
  Schattenpfade `/exammode` (root) und `/api/activeips` existieren nicht.

## Exam Lifecycle State Machine

- Exam duration is preset by the admin: `examstate` is a SQLite singleton (`idle`/`running`/`paused`/`stopped`) with duration, extra seconds, and accumulated pause time; Drizzle owns the schema, runtime access is direct SQLite via `repo/exam.ts`.
- `service/exam.ts` is authoritative for remaining time; the clock is injectable for tests. `updated_at` doubles as the pause-start anchor (pause()/resume() only touch it; addExtra during a pause deliberately does not).
- Pause only stops the countdown — uploads and Unterlagen downloads stay allowed. Stop and natural expiry both mean exam mode off with internet released; there is no grace period.
- Startup always resets to exam mode off / internet free and forces a stuck `running`/`paused` examstate to `stopped` — this reverses the earlier "block internet on startup" behavior.
- Uploads (`POST /upload`) and Unterlagen downloads (`GET /unterlagen/*`) are gated by `service.exam.isExamWindowOpen()`; the Unterlagen index (`GET /`) stays public. Admins are not exempted from the Unterlagen gating.
- Early submissions are encouraged; `canResubmit()` already enforces "submitted + left the network = no resubmission, submitted + stayed = resubmission allowed".

## Runtime-Editable Upload Policy

- Allowed upload file types are initialized from env but can be changed by admins while the process is running.
- Upload validation reads the current in-memory config value rather than treating the env-derived startup value as immutable.

## 2026-10-30: Unterlagen-Lebenszyklus im Admin-Bereich (#134)

- **Choice**: Unterlagen werden über die Web-Oberfläche gepflegt (hochladen,
  ersetzen, einzeln löschen, alles löschen). Der SSH-Handgriff entfällt.
  Ersetzen verlangt eine ausdrückliche Bestätigung (Häkchen im Formular plus
  `hx-confirm`), „alles löschen“ ein Bestätigungsfeld im POST.
- **Choice**: Ablage bleibt **flach** in `UNTERLAGEN_DIR` — keine
  Unterordner pro Termin, keine Versionierung, kein Archiv. Unterlagen
  werden über Termine hinweg wiederverwendet; ein Datumsbaum erzeugt nur
  den Fehler „falscher Ordner“, der erst im Examen auffällt.
- **Choice**: Eigene Dateityp-Liste `UNTERLAGEN_PERMITTED_FILETYPES`
  (Default `md`), unabhängig von `PERMITTED_FILETYPES` (Abgaben) und
  nicht zur Laufzeit über die UI änderbar. `MAX_UPLOAD_MB` und das
  Content-Sniffing der Abgaben gelten mit.
- **Choice**: Kein Exam-Gating für den Admin-Upload; das Gating aus #131
  bleibt auf `GET /unterlagen/*` und `POST /upload` beschränkt.

## 2026-10-30: Drizzle ersetzt Prisma als Schema- und Migrationsautorität (#133)
Ersetzt den früheren Abschnitt „Hybrid Persistence Strategy". Prisma ist aus
dem Produktivpfad verschwunden: keine Prisma-Tasks, keine
Prisma-Dependencies, kein generierter Client, kein `prisma/`-Verzeichnis.

- **Drizzle besitzt Schema und Migrationen, nicht die Laufzeit.**
  `drizzle/schema.ts` spiegelt den Ist-Zustand inklusive aller Indizes und
  Unique-Constraints; `repo/*.ts` bleiben bei handgeschriebenem SQL über
  `@db/sqlite`. Grund: `drizzle-orm@0.45.3` hat keinen `@db/sqlite`-Adapter
  — verfügbar sind `libsql/*`, `sqlite-proxy`, `prisma/*` und der
  Community-Adapter `@niuiic/drizzle-orm-dbsqlite`. Ein ORM-Umbau wäre kein
  Nebenschritt, deshalb entfällt er; die forensisch optimierten Queries
  bleiben unangetastet.
- **`drizzle-kit` läuft nur auf dem Entwicklungsrechner** (`deno task
  db:generate`, mit `--node-modules-dir=auto`, weil das Kit `drizzle-orm`
  über Node/jiti auflöst und esbuild-Binaries mitbringt). Auf der Appliance
  spielt `lib/migrate.ts` die erzeugten SQL-Dateien über `@db/sqlite` ein —
  kein Node-Binary, kein esbuild auf der Firewall.
- **Baseline statt Neuaufbau.** `drizzle/0000_baseline.sql` beschreibt den
  Ist-Zustand idempotent (`IF NOT EXISTS`; zusätzlich `DROP INDEX IF EXISTS`
  für die 2026 entfernten redundanten Einzelspalten-Indizes). Existiert der
  Zustand bereits, verbucht der Runner die Migration, ohne sie auszuführen;
  fehlt der Datenbank etwas (älterer Stand), gleicht derselbe Lauf sie an.
  Dev und Produktion landen so auf demselben Schema. (Die Annahme, die
  Sense-DB stehe noch bei der Prisma-Migration `20260307191214`, war falsch:
  geprüft wurde die veraltete `/home/georg/uploadthing.db`; die echte DB in
  `/home/georg/uploadthing/uploadthing.db` war vollständig — siehe
  `HISTORY.md`.)
- **Journalformat von drizzle-kit.** `__drizzle_migrations` wird mit `hash`
  (SHA-256 über den Dateiinhalt), `created_at` (Journal-`when` in
  Millisekunden) und Drizzles `id SERIAL PRIMARY KEY` geschrieben. Damit
  sieht `drizzle-kit migrate` auf dem Entwicklungsrechner exakt denselben
  Stand wie die Appliance.
- **Migrationen laufen beim App-Start**, vor dem ersten Request, idempotent
  und in `BEGIN EXCLUSIVE`. Kein externer Deploy-Schritt, den man vergessen
  kann. Ist die Datenbank weiter als der Code (unbekannte Hashes im
  Journal), verweigert der Start mit deutscher Meldung, statt halb migriert
  weiterzulaufen.
- **Forward-only.** Keine Down-Migrationen; der Rückweg ist das DB-Backup
  (#148).
- **`DATABASE_URL` bleibt Prisma-kompatibel.** `file:`-Pfade gelten
  weiterhin relativ zum früheren `prisma/`-Verzeichnis (`lib/dbpath.ts`),
  damit alle bestehenden `.env`-Dateien — auch die der Produktion —
  unverändert gültig bleiben. Nur SQLite-`file:`-URLs werden akzeptiert.
- **`_prisma_migrations` bleibt als Alt-Tabelle liegen.** Sie wird von
  niemandem mehr gelesen; entfernen erst nach einem Backup (kein
  Automatismus, kein Datenverlust-Risiko).
- **Nach der Saison** wird die Runtime-Frage neu gestellt; ein Wechsel auf
  Node + `drizzle-orm/better-sqlite3` bleibt möglich, ohne dieses Ticket zu
  wiederholen.

## Admin Forensics Query Strategy

- The admin forensics page was changed from per-IP N+1 reads to range-level table reads aggregated in memory in `service/ipadmin.ts`.
- Composite indexes were added for the reporting hot path: `cookiepresents(ip, at)`, `registrations(ip, at)`, `abgaben(ip, at)`, and `ipfact(seen, ip)`.
- After validating actual query plans, redundant single-column indexes `cookiepresents(ip)`, `registrations(ip)`, `ipfact(ip)`, and `ipfact(seen)` were removed (back then through the Prisma migration workflow, today baked into the Drizzle baseline).
- Query-shape tuning for the range aggregation now prefers reducing SQL-side global sorting and performing final per-IP ordering in application code when that avoids temp b-tree work without changing behavior.

## Exam-Oriented Authentication

- The app does not use a conventional username/password flow for students.
- Authentication is a hybrid of operational verification and a signed session cookie.
- The session cookie stores minimal data and is re-hydrated into a user record on each request.

## Cookie Presence Versus Explicit Registration

- Explicit registration events and ongoing cookie-based presence are distinct concepts.
- `registrations` records deliberate registration actions.
- `cookiepresents` records each request that arrives with a valid cookie and resolved user.
- The admin forensics view treats cookie presence as the current user attribution for an IP while still showing explicit registration history separately.
- The student/admin overview IP set is derived from the union of `ipfact`, `cookiepresents`, `registrations`, and submissions so cookie-only IPs are not dropped from the report.
- The overview's displayed report count now combines in-range `ipfact` hits with in-range `cookiepresents` hits, while the detailed IP history list remains an `ipfact`-only breakdown.
- Anomaly detection runs over all aggregated IP entries, not only IPs with current cookie presence, so registration-only multi-IP users still surface as anomalies.

## Socket IP As Ground Truth

- The system treats `c.env.info.remoteAddr` as the authoritative client IP.
- Proxy headers such as `X-Forwarded-For` are intentionally not trusted because auditability matters more than generic proxy compatibility in this environment.

## Local-Time Service, UTC Persistence

- UI and service behavior are expressed in local-time terms for humans.
- Persistence uses UTC timestamps so storage and range queries stay consistent.

## Archival Instead Of Full Deletion For Registrations

- Exam-start operations archive `registrations` into `forensic_registrations` before clearing the active registration table.
- This preserves audit history across exams while resetting the live working set.

## AI Knowledge Persistence

- `AGENTS.md` is the bootstrap document.
- Long-lived agent knowledge belongs in `docs/ai/`.

## Teacher/Student Split in Admin Forensics View

- The admin forensics report now splits IP cards by role: students and teachers each get their own section.
- Classification is determined by the most recent `cookie_presents[0]` user: `klasse === "LehrendeR"` → teacher section, otherwise → student section.
- IPs without cookies remain in the "Unbekannte IP-Adressen" section unchanged.
- Student and teacher sections are both sorted by (lastname, firstname), parsed from the display name by splitting on the first blank.
- This avoids mixed-context IP cards and makes the teacher audit trail more discoverable.

## Fail-Strict Configuration

- All security-relevant and operation-critical configuration is now required at startup.
- `requireEnv()` throws immediately at module load time with a German error message if a required env var is missing, instead of silently falling back to a default.
- `parseRequiredIpList()` enforces that IP whitelists (`ADMIN_IPS`) are explicitly configured. `ACTIVEIPS_ALLOWED_IPS` ist mit #145 entfallen.
- The following variables were changed from optional/fallback to required: `ABGABEN_DIR`, `UNTERLAGEN_DIR`, `LISTEN_PORT`, `COOKIE_SECRET`, `ADMIN_IPS`, `SERVICE_DN`, `SERVICE_PW`, `SERVICE_URL`, `SEARCH_BASE`. (`ACTIVEIPS_ALLOWED_IPS` stand hier ursprünglich auch — seit #145 entfernt, siehe `HISTORY.md`.)

## Internal Scroll Container for Fixed Navbar

- The main content area (`#app-main`) uses an internal scroll container instead of body scrolling.
- Body has `overflow: hidden` and `height: 100vh`.
- `#app-main` uses `margin-top`, `height: calc(100vh - offset)`, and `overflow-y: auto`.
- Content scrolls within this container and stops at the navbar bottom edge.
- The scrollbar is hidden via CSS (`scrollbar-width: none` + `::-webkit-scrollbar`) while preserving mouse wheel, Page Up/Down, and touch scrolling.
- This prevents content from sliding behind the transparent glassmorphism navbar while keeping the background visible through it.

## 2026-06-09: Missed count stops after last submission

- **Choice**: IP detail modal content swap into `#ip-detail-modal-content` via `hx-target` with `hx-disinherit="hx-select"` on row wrappers to block inherited `hx-select` from the panel section.

- **Choice**: Modal show triggered via global `htmx:afterSwap` listener in `templates/index.hbs`, checking `evt.detail.target.id === 'ip-detail-modal-content'`. Per-card `hx-on` handlers removed.

- **Choice**: All external JS/CSS libraries stored as non-minified development source files with versioned filenames and symlinks (e.g., `htmx.js` → `htmx-2.0.10.js`). This enables source inspection and makes upgrades explicit.

- **Choice**: `bootstrap.bundle.js` loaded in `<head>` (after `htmx.js`, before `toast.js`) to enable Bootstrap modal API. Previously only `bootstrap.css` was loaded, leaving `bootstrap.Modal` undefined.

## 2026-06-09: IP presence timeline with absent highlighting

- **Choice**: `ServiceIPDetail.seen_at_desc` changed from `string[]` to `{ at: string; present: boolean }[]`. The `getIPDetail()` service generates a continuous minute-by-minute timeline from the IP's first-seen to last-seen within the query range.

- **Choice**: Absent minutes rendered with `list-group-item-danger` (red-tinted background) and a "fehlt" (absent) label. Present minutes have no special styling.

- **Choice**: `seen_count` set to `seenRows.length` (actual sightings), not the timeline length.

## 2026-06-09: Cookie deduplication in IP detail modal

- **Choice**: Cookie entries grouped by minute with a count accumulator. `count_gt_1` boolean avoids showing `(&times;1)` — multiplier only appears when duplicates exist. Applied only in `getIPDetail()`, not in `for_range()`.

## 2026-06-09: Database cleanup cutoff to 1 year

- **Choice**: `cleanupDatabaseOlderThanOneMonth` renamed to `cleanupDatabaseOlderThanOneYear`, cutoff changed from `setMonth(-1)` to `setFullYear(-1)`. Affects all 4 tables uniformly.

## 2026-06-09: IP detail modal 2-column layout

- **Choice**: Modal restructured: left column stacks Abgaben → Registrierungen → Cookies (each max 35vh), right column holds IP-Präsenz with `flex-grow-1` and `max-height: 80vh`. Content-driven sizing, no forced `min-height`.

## 2026-10-30: Produktionshost ist der Dell, nicht mehr die Sense (#143)

- **Choice**: Die App läuft als **systemd-User-Unit** auf dem Dell, direkt
  aus dem Arbeits-Repo (`~/.config/systemd/user/uploadthing.service`,
  Quelle `systemd/uploadthing.service`), gebunden auf
  `192.168.21.2:443`, `Restart=always`. Die Sense bleibt Firewall/DNS/DHCP.
- **Reason**: Die App soll nicht mehr auf dem Firewall-Gerät wohnen
  (Ressourcen, Fehlerverhalten, Deployment über `rc.d` + `startloop.sh`
  mit PIDfile-Problemen). Eigene 443 statt Loopback+DNAT macht den
  Datenpfad gerade und erlaubt der Sense, ihre GUI wieder auf 443 zu
  betreiben.
- **Considered**: Auf der Sense bleiben und nur die Steuerung auf die API
  umstellen (verworfen: der Prüfungsserver gehört nicht auf die Firewall).
- **Tradeoff**: Der Dell ist gleichzeitig Arbeitsgerät — ein Absturz oder
  Zuklappen trifft App und Sense-VM. Suspend ist deshalb per
  `logind.conf.d/uploadthing.conf` systemweit abgeschaltet
  (`systemd-inhibit` scheitert an polkit 127).

## 2026-10-30: User-Unit statt System-Unit, 443 über sysctl (#143)

- **Choice**: Der Dienst läuft als **User-Unit** (`systemctl --user`,
  `WantedBy=default.target`, `loginctl enable-linger georg`). Port 443 wird
  über `net.ipv4.ip_unprivileged_port_start = 443`
  (`/etc/sysctl.d/99-uploadthing-ports.conf`) freigegeben.
- **Reason**: `AmbientCapabilities`/`CapabilityBoundingSet` sind im
  User-Manager nicht verfügbar (er läuft selbst ohne Rechte); `setcap` auf
  der Deno-Binary ginge, würde aber bei jedem Deno-Upgrade verloren gehen
  und gilt dann für *jeden* Deno-Aufruf des Benutzers. Die sysctl-Zeile ist
  eine Zeile, überlebt Upgrades und braucht keine Capability-Pflege.
- **Considered**: System-Unit mit `AmbientCapabilities=CAP_NET_BIND_SERVICE`
  (verworfen: Dienst dann root-nah verwaltet, obwohl der Prozess als
  `georg` läuft); Socket-Activation über eine System-Socket-Unit
  (verworfen: deutlich mehr bewegliche Teile).
- **Tradeoff**: Auf diesem Einzelbenutzer-Rechner darf damit jeder Prozess
  von `georg` auf Ports ≥ 443 binden — auf einem Mehrbenutzersystem wäre
  das zu weitgehend.

## 2026-10-30: Code aus dem Arbeits-Repo, Env und Daten außerhalb (#143)

- **Choice**: `WorkingDirectory` ist
  `/home/georg/repos/georgernstgraf/uploadthing`; die Produktions-Env
  liegt als `~/.config/uploadthing/uploadthing.env` (Modus 600) daneben,
  die Daten in `~/uploadthing-data/` (`uploadthing.db`, `abgaben/`,
  `unterlagen/`).
- **Reason**: Ein separates Deployment-Verzeichnis ist doppelte Pflege
  (Pull, Divergenz, vergessene Commits). Zugleich darf die Produktion
  weder das Dev-`.env` im Repo lesen noch in die Dev-DB schreiben.
- **Considered**: Deployment-Klon `~/uploadthing-app` (verworfen: zweiter
  Checkout, Treiber für Verwirrung); Produktionswerte im Repo-`.env`
  (verworfen: Dev-Konfiguration würde überschrieben).
- **Tradeoff**: `DATABASE_URL` muss ein **absoluter** `file:`-Pfad sein —
  ein relatives `file:../uploadthing.db` würde relativ zum früheren
  `prisma/`-Verzeichnis im Repo auf die Entwicklungs-DB zeigen.

## 2026-10-30: Interne CA für die Firewall-API (#142, #149)

- **Choice**: Die Sense hat eine interne CA „uploadthing internal CA" und
  ein Server-Zertifikat `CN=sense.internal` mit
  `SAN DNS:sense.internal, IP:192.168.21.1`; die CA liegt als
  `~/certs/sense-ca.pem` auf dem Dell, Deno bekommt sie über `DENO_CERT`.
  `OPNSENSE_API_URL=https://sense.internal`.
- **Reason**: Die App muss TLS vollständig prüfen können. Die
  Let's-Encrypt-Kette deckt nur `tst.spengergasse.at` ab — und dieser Name
  zeigt seit dem Umzug auf die App, nicht mehr auf die Firewall.
- **Considered**: `--unsafely-ignore-certificate-errors=<host>`
  (verworfen: schaltet die Prüfung prozessweit aus); Hosts-Eintrag auf
  einen LE-Namen (verworfen: kein passender Name vorhanden, LE-Ausstellung
  für `sense.internal` unmöglich).
- **Tradeoff**: Die CA muss auf jeden Client, der die API nutzen will;
  sie läuft 2036 ab und ist an die Sense gebunden (Wiederherstellung der
  `config.xml` bringt sie zurück).

## 2026-10-30: Sense-GUI zurück auf 443, DNAT entfernt (#143, #149)

- **Choice**: Die OPNsense-GUI lauscht wieder auf **443**; die DNAT-Regel
  `uploadthing HTTPS 443 to 8000` und der GUI-Port 8443 sind gelöscht.
- **Reason**: Beides existierte nur, weil die App die 443 auf der Sense
  belegte. Mit dem Umzug ist die Einschränkung sinnlos, und 8443 ist eine
  Port-Ausnahme, die man sich merken muss.
- **Tradeoff**: Wird später wieder eine Portweiterleitung gebraucht, muss
  sie neu angelegt werden — sie steht mit allen Regeln im CSV-Export
  (`appliance/legacy-rules-2026-10-30.csv`).

## 2026-10-30: DNS-Hostnamen liegen in Unbound, nicht in dnsmasq

- **Choice**: `tst.spengergasse.at` (→ `192.168.21.2`), `tik.internal` und
  die Geräte-Einträge werden als **Unbound Host Overrides** gepflegt
  (`/api/unbound/settings/searchHostOverride`); die gleichnamigen
  dnsmasq-Einträge sind wirkungslos.
- **Reason**: Auf der Sense beantwortet Unbound Port 53 (`sockstat` zeigt
  `unbound`, nicht `dnsmasq`). Ein dnsmasq-Eintrag ändert nichts an der
  Auflösung — genau dieser Irrweg hat beim Umzug Zeit gekostet.
- **Tradeoff**: Wer im GUI den DHCP-/dnsmasq-Bereich bearbeitet, ändert
  nichts an der Namensauflösung; nach jeder Änderung `dig @192.168.21.1`
  prüfen.
