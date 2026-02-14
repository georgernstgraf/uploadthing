#!/bin/bash
set -euo pipefail

if [ $# -ne 2 ]; then
	echo "Usage: $0 <cssfile> <imagefile>" >&2
	exit 1
fi

CSSFILE="$1"
IMAGEFILE="$2"

if [ ! -f "$CSSFILE" ]; then
	echo "Error: CSS file not found: $CSSFILE" >&2
	exit 1
fi

if [ ! -f "$IMAGEFILE" ]; then
	echo "Error: Image file not found: $IMAGEFILE" >&2
	exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NEW_ROOT=$("$SCRIPT_DIR/.venv/bin/python3" "$SCRIPT_DIR/color-theme.py" "$IMAGEFILE")

python3 - "$CSSFILE" "$NEW_ROOT" <<'PYEOF'
import re
import sys

css_path = sys.argv[1]
new_root = sys.argv[2]

with open(css_path, 'r') as f:
    content = f.read()

def extract_root_block(text):
    match = re.search(r':root\s*\{', text)
    if not match:
        return None
    start = match.start()
    brace_start = match.end() - 1
    depth = 0
    for i in range(brace_start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[start:i+1]
    return None

old_block = extract_root_block(content)
new_block = extract_root_block(new_root)

if not old_block:
    print("Error: No :root {} block found in CSS file", file=sys.stderr)
    sys.exit(1)

if not new_block:
    print("Error: No :root {} block in color-theme output", file=sys.stderr)
    sys.exit(1)

new_content = content.replace(old_block, new_block, 1)

with open(css_path, 'w') as f:
    f.write(new_content)

print(f"Updated {css_path}")
PYEOF
