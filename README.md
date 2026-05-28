# Uploadthing

Server-rendered exam workflow app for supervised school network use.

## Configuration

All configuration is done through environment variables.
The application fails to start if any required variable is missing.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Prisma-style SQLite URL, e.g. `file:../uploadthing.db` |
| `ABGABEN_DIR` | Directory for uploaded submission files |
| `UNTERLAGEN_DIR` | Directory for exam materials served to students |
| `LISTEN_HOST` | IP address to bind to (e.g. `127.0.0.1`) |
| `LISTEN_PORT` | Port to listen on (e.g. `8000`) |
| `COOKIE_SECRET` | HMAC key for session cookies (long random string) |
| `ADMIN_IPS` | Comma-separated IPs allowed to register as teacher, e.g. `127.0.0.1,192.168.21.2` |
| `ACTIVEIPS_ALLOWED_IPS` | Comma-separated IPs allowed to report active IPs via `/activeips`, e.g. `10.0.0.1,192.168.21.2` |
| `SERVICE_DN` | LDAP service account DN |
| `SERVICE_PW` | LDAP service account password |
| `SERVICE_URL` | LDAP server URL, e.g. `ldaps://ldap.example.com` |
| `SEARCH_BASE` | LDAP search base DN |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PERMITTED_FILETYPES` | `zip` | Comma-separated allowed upload extensions |
| `MAX_UPLOAD_MB` | `50` | Maximum upload file size in MB |
| `INTERNET_ACTIVE` | `true` | Initial internet state (overridden by exam mode toggle) |
| `EXAMMODE_COMMAND` | `exammode` | System command to toggle internet access |
| `COOKIE_NAME` | `ut_session` | Session cookie name |
| `DENO_ENV` | `development` | Runtime environment |
| `LOGDIR` | `/var/log/exampy` | Log directory |
| `TODAY_HOURS_CUTOFF` | `12` | Hours before midnight for admin time filter default |
| `ADMIN_STALE_MINUTES` | `3` | Minutes before an IP is considered stale |
| `ADMIN_REFRESH_SECONDS` | `15` | Auto-refresh interval for admin forensics page |

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
