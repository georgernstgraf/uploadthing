# Uploadthing

Webserver on examdns-router

## Color Theme Generator

The `tools/color-theme.py` script extracts dominant colors from background images and generates Bootstrap 5 CSS variable overrides.

### Setup

```bash
# Create virtual environment and install dependencies
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt
```

### Usage

```bash
# Generate colors (outputs to stdout)
tools/.venv/bin/python3 tools/color-theme.py

# Specify different images
tools/.venv/bin/python3 tools/color-theme.py --image=path/to/bg-custom

# Write to file
tools/.venv/bin/python3 tools/color-theme.py --output=generated-colors.css

# Skip blur (analyze raw image)
tools/.venv/bin/python3 tools/color-theme.py --no-blur

# Adjust number of color clusters
tools/.venv/bin/python3 tools/color-theme.py --clusters=8
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--image` | `static/img/bg-lego` | Base path for images (light: `<path>.png`, dark: `<path>-dark.png`) |
| `--blur` | `True` | Apply blur before extraction (matches CSS blur effect) |
| `--no-blur` | - | Skip blur, analyze raw image |
| `--output` | stdout | Output file path |
| `--clusters` | 6 | Number of color clusters to extract |

### Updating the Theme

1. Run the tool to generate CSS
2. Copy the output between `/* BEGIN GENERATED COLORS */` and `/* END GENERATED COLORS */`
3. Paste into `static/lego-theme.css` Section 1

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
