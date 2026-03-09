# Uploadthing

Server-rendered exam workflow app for supervised school network use.

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
