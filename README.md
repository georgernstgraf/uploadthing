# Uploadthing

Server-rendered exam workflow app for supervised school network use.

## Configuration

All configuration is done through environment variables.
The application fails to start if any required variable is missing.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite URL in Prisma notation, e.g. `file:../uploadthing.db`; relative paths resolve from the former `prisma/` directory |
| `ABGABEN_DIR` | Directory for uploaded submission files |
| `UNTERLAGEN_DIR` | Directory for exam materials served to students |
| `LISTEN_HOST` | IP address to bind to (e.g. `127.0.0.1`) |
| `LISTEN_PORT` | Port to listen on (e.g. `8000`) |
| `TLS_CERT_PATH` | Path to a PEM certificate chain (e.g. `fullchain.pem`) — enables native TLS via `Deno.serve`; must be set together with `TLS_KEY_PATH` |
| `TLS_KEY_PATH` | Path to a PEM private key (e.g. `privkey.pem`); must be set together with `TLS_CERT_PATH` |
| `COOKIE_SECRET` | HMAC key for session cookies (long random string) |
| `ADMIN_IPS` | Comma-separated IPs allowed to register as teacher, e.g. `127.0.0.1,192.168.21.2`; a teacher may also register from a device whose MAC is approved (see `ADMIN_MACS` and `/admin/application`) |
| `SERVICE_DN` | LDAP service account DN |
| `SERVICE_PW` | LDAP service account password |
| `SERVICE_URL` | LDAP server URL, e.g. `ldaps://ldap.example.com` |
| `SEARCH_BASE` | LDAP search base DN |

### MikroTik (active IPs and MACs)

The app polls the MikroTik wireless registration table itself every 60 s
(`GET /rest/interface/wireless/registration-table` over HTTP Basic,
read-only) and stores IP and MAC per sighting in `ipfact`. There is no
HTTP endpoint and no IP whitelist for reporting active IPs anymore. The
admin forensics page shows whether the last poll succeeded, was empty,
or could not reach the Tik.

| Variable | Description |
|----------|-------------|
| `TIK_URL` | Base URL of the Tik REST API, e.g. `http://tik.internal` |
| `TIK_USER` | Read-only REST user (`monitoring-rest`) |
| `TIK_PASSWORD` | Password of that user — only in `.env`, never in the repository |

All three must be set together or not at all. Without them polling is
disabled (local development) and the admin page shows “nicht
konfiguriert”; setting only some of them aborts startup with a German
error message.

### Exam lock (OPNsense API)

The exam lock is switched exclusively over the OPNsense API
(`POST /api/firewall/filter/toggleRule/{uuid}` + `apply`, read via
`POST /api/firewall/filter/searchRule`). There is no system command and
no write to `/conf/config.xml`.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPNSENSE_API_URL` | — | Base URL of the firewall API, e.g. `https://sense.internal` (the Sense GUI listens on 443 again since #143); required as soon as key and secret are set. Requires `DENO_CERT=~/certs/sense-ca.pem` |
| `OPNSENSE_API_KEY` | — | API key (HTTP Basic user); set together with `OPNSENSE_API_SECRET` or not at all |
| `OPNSENSE_API_SECRET` | — | API secret (HTTP Basic password); set together with `OPNSENSE_API_KEY` or not at all |
| `OPNSENSE_EXAMMODE_RULE_UUID` | — | UUID of the blocking rule (`descr=doku`, `type=reject`); required as soon as key and secret are set |

Without key and secret the lock is disabled (local development) and the
admin panel shows “Nicht konfiguriert”. Setting only one of the two aborts
startup with a German error message.

TLS: the appliance presents its GUI certificate on the API address. Deno
always verifies the hostname, and verification can only be disabled
process-wide and host-scoped. Either make `OPNSENSE_API_URL` use a name the
certificate covers, or start the process with
`--unsafely-ignore-certificate-errors=<api-host>`.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PERMITTED_FILETYPES` | `zip` | Comma-separated allowed upload extensions |
| `MAX_UPLOAD_MB` | `50` | Maximum upload file size in MB |
| `COOKIE_NAME` | `ut_session` | Session cookie name |
| `DENO_ENV` | `development` | Runtime environment |
| `LOGDIR` | `/var/log/exampy` | Log directory |
| `TODAY_HOURS_CUTOFF` | `12` | Hours before midnight for admin time filter default |
| `ADMIN_STALE_MINUTES` | `3` | Minutes before an IP is considered stale |
| `ADMIN_REFRESH_SECONDS` | `15` | Auto-refresh interval for admin forensics page |
| `ADMIN_MACS` | — | Comma-separated MAC addresses allowed to log in as teacher in addition to `ADMIN_IPS`; empty/absent means no MAC approval via env (the in-app allowlist still works). Invalid entries abort startup with a German message |
| `PUBLIC_URL` | `http://<LISTEN_HOST>:<LISTEN_PORT>/` | URL displayed in the hero header (full URL incl. scheme, optionally with port); decoupled from `LISTEN_HOST`, which only determines the bind address. Its hostname is also the browser tab title (`page_title`); without it the tab shows `<LISTEN_HOST>:<LISTEN_PORT>`. An unparseable value aborts startup with a German message |

## Database Schema And Migrations

Drizzle is the schema and migration authority: `drizzle/schema.ts` describes
the tables, `drizzle/*.sql` are the versioned migrations, `drizzle/meta/`
holds the journal and snapshots.

Migrations are applied **automatically at app start** (`lib/migrate.ts`,
idempotent, `BEGIN EXCLUSIVE`, forward-only) — there is no separate deploy
step. Runtime access stays hand-written SQL via `@db/sqlite`.

Schema changes (development machine only):

```bash
deno task db:generate --name <migration_name>   # drizzle-kit generate
deno task db:migrate                            # apply pending migrations manually
```

`drizzle-kit` brings esbuild binaries and therefore never runs on the
appliance; a database that knows a newer migration than the running code
makes the app refuse to start instead of running half-migrated.

## Appliance Scripts (`appliance/`) — wird abgebaut

The `appliance/` directory contains the OPNsense/FreeBSD appliance-side
half of the exam system (exam mode toggle, scan helpers, rc.d service,
redacted config snapshots, MikroTik artifacts). It was imported from the
former `examsense` repository.

**Seit 2026-10-30 läuft die App auf dem Dell**; die Sense macht nur noch
Firewall/DNS/DHCP. Exam-Sperre (OPNsense-API) und IP-/MAC-Erfassung
(MikroTik-REST) sind im App-Prozess. Die Skripte hier werden mit #144
gelöscht — neuer Code gehört nicht mehr in dieses Verzeichnis. Siehe
`appliance/README.md` und `docs/ai/OPERATIONS.md` („Appliance Setup").

## Project Knowledge

Primary project guidance lives in `docs/ai/`:

- `docs/ai/CONVENTIONS.md` for commands, coding rules, and validation requirements
- `docs/ai/DECISIONS.md` for architecture and implementation choices
- `docs/ai/PITFALLS.md` for non-obvious constraints and sharp edges
- `docs/ai/DOMAIN.md` for exam workflow and security model context
- `docs/ai/STATE.md` for the latest implementation status

## Color Theme Generator

The `scripts/color-theme.py` script extracts dominant colors from an image and generates Bootstrap 5 CSS variables with WCAG AAA compliant contrast ratios (7:1).

### Setup

```bash
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt
```

### Usage

```bash
# Write to file
scripts/.venv/bin/python3 scripts/color-theme.py path/to/image.png -o colors.css

# Skip blur (analyze raw image)
scripts/.venv/bin/python3 scripts/color-theme.py path/to/image.png --no-blur

# Adjust number of color clusters
scripts/.venv/bin/python3 scripts/color-theme.py path/to/image.png -c 8
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `image` | (required) | Path to source image |
| `--blur` | `True` | Apply blur before extraction |
| `--no-blur` | - | Skip blur, analyze raw image |
| `--output`, `-o` | stdout | Output file path |
| `--clusters`, `-c` | 6 | Number of color clusters |

### How It Works

1. Extract dominant colors from the image.
2. Assign semantic roles (primary, secondary, success, warning, danger, info, light, dark).
3. Adjust button colors to ensure 7:1 contrast with text.
4. Generate `--bs-*` CSS variables.
