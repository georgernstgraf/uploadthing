# Uploadthing

Webserver on examdns-router

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

1. Extracts dominant colors from the image
2. Assigns semantic roles (primary, secondary, success, warning, danger, info, light, dark)
3. Adjusts button colors to ensure 7:1 contrast with text
4. Generates `--bs-*` CSS variables

## Security Architecture

This application employs a hybrid technical-operational security model, tailored specifically for supervised examination environments:

### 1. Hybrid Authentication Model
The system does not rely on traditional passwords for students, which minimizes friction during time-constrained exams. Instead, it uses a two-pronged approach:
- **Operational Verification (Physical Auth)**: At the beginning of the exam, the supervising teacher visually verifies that the name displayed on each student's screen matches the physical student.
- **Session Management**: Upon selecting an identity, the server issues an HMAC-SHA256 signed session cookie to the browser. This handles ongoing technical authorization.

### 2. Forensic Auditing (Detective Control)
To deter and detect impersonation or spoofing after the initial visual check, the system maintains a rigorous forensic audit trail:
- Every action (registration, submission) is strictly logged against the underlying socket IP address (`c.env.info.remoteAddr`), explicitly ignoring easily spoofed headers like `X-Forwarded-For`.
- The Forensic View allows teachers to audit the history of each IP address and identity. If a student attempts to spoof another student's identity mid-exam, the forensic data will clearly expose the anomaly (multiple identities operating from the same machine/IP).

### 3. Application Hardening
- **Path Sanitization**: `safeFileComponent` strictly prevents directory traversal attacks during file uploads.
- **SQL Injection Immunity**: Prisma ORM is utilized for all database interactions. Since no raw SQL queries are used, the application is inherently immune to SQL injection.
- **Environment Isolation**: Service passwords, cookie secrets, and other sensitive configurations are loaded strictly via `.env` files and never committed to version control.

## Time Handling

This project uses the following conventions for time handling:

### 1. UI Layer (Local Time)

- All time-related inputs and displays in the UI are in **Local Time**.
- User input strings (e.g., from datetime-local or separate date/time inputs) are handled as local time strings.

### 2. Service Layer (Date Objects)

- As soon as time-related data enters the **Service Layer**, it must be converted into JavaScript `Date` objects.
- Business logic should primarily work with `Date` objects.
- When formatting for the UI, use utilities in `lib/timefunc.ts`.

### 3. Repository Layer (UTC/ISO Strings)

- The **Repository Layer** receives `Date` objects and is responsible for persisting them.
- SQLite does not have a native `DateTime` type; we store dates as **ISO 8601 strings in UTC** (e.g., `2023-01-01T12:00:00.000Z`).
- When saving to SQLite, always use `date.toISOString()`.
- When reading from SQLite, wrap the stored string in `new Date(row.at)` to return a proper `Date` object.
- Prisma handles `DateTime` fields automatically, ensuring they are mapped to/from `Date` objects correctly.

### 4. Utilities (`lib/timefunc.ts`)

- Use `localDateString`, `localTimeString`, and `localDateTimeString` for consistent local time formatting.
- `Date.toISOString()` is the standard for UTC representation.
