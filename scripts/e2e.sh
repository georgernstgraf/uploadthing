#!/bin/bash
#
# E2E-Smoke-Suite (#135): examkritische Browser-Flows in Chromium.
#
# Getrennt von `deno task test` (schnelle Deno-Suite, ~4 s): hier wird ein
# echter Browser gesteuert und eine eigene Server-Instanz gestartet.
#
# Vollständig autark — keine Schul-LDAP-, Netzwerk- oder `~/.env`-Abhängigkeit:
#   * eigene Wegwerf-Datenbank (Kopie von vacuum.db) und eigene Verzeichnisse
#     unter einem temporären Arbeitsverzeichnis
#   * eigener Port (Default 8099), damit ein laufender Dev-Server unberührt bleibt
#   * OPNSENSE_* und TIK_* bleiben leer → keine Firewall-, keine
#     MikroTik-Aufrufe; `LDAP` wird nie kontaktiert (Sitzungen werden
#     vorbereitet, siehe test/e2e/seed.ts)
#   * die Werte werden hier gesetzt, `.env` wird NICHT geladen
#
# Aufruf: `deno task e2e` (Optionen: E2E_PORT, E2E_KEEP=1, E2E_HEADED=1)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${E2E_PORT:-8099}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/uploadthing-e2e.XXXXXX")"
SERVER_LOG="$WORK_DIR/server.log"
SERVER_PID=""

cleanup() {
    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
    if [[ "${E2E_KEEP:-0}" == "1" ]]; then
        echo "Arbeitsverzeichnis behalten: $WORK_DIR"
    else
        rm -rf "$WORK_DIR"
    fi
}
trap cleanup EXIT

if fuser "${PORT}/tcp" >/dev/null 2>&1; then
    echo "Port ${PORT} ist bereits belegt — E2E-Suite bricht ab (E2E_PORT setzen)." >&2
    exit 1
fi

export LISTEN_HOST=127.0.0.1
export LISTEN_PORT="$PORT"
export DATABASE_URL="file:$WORK_DIR/e2e.db"
export ABGABEN_DIR="$WORK_DIR/abgaben"
export UNTERLAGEN_DIR="$WORK_DIR/unterlagen"
export COOKIE_SECRET="e2e-smoke-suite-secret-$RANDOM$RANDOM"
export ADMIN_IPS="127.0.0.1"
export PERMITTED_FILETYPES="zip"
export MAX_UPLOAD_MB="5"
export DENO_ENV="development"

# Nur Platzhalter: die Suite meldet sich nie über LDAP an (requireEnv in
# lib/config.ts verlangt die Variablen trotzdem).
export SERVICE_DN="cn=e2e"
export SERVICE_PW="e2e"
export SERVICE_URL="ldap://127.0.0.1:1"
export SEARCH_BASE="dc=e2e"

# Keine echten Integrationen: weder Firewall noch MikroTik.
export OPNSENSE_API_URL=""
export OPNSENSE_API_KEY=""
export OPNSENSE_API_SECRET=""
export OPNSENSE_EXAMMODE_RULE_UUID=""
export TIK_URL=""
export TIK_USER=""
export TIK_PASSWORD=""
unset DENO_CERT TLS_CERT_PATH TLS_KEY_PATH PUBLIC_URL ADMIN_MACS LOGDIR

mkdir -p "$ABGABEN_DIR" "$UNTERLAGEN_DIR"

echo "== E2E-Fixtures vorbereiten =="
deno run -A test/e2e/seed.ts

echo "== Testserver starten (Port $PORT, Log: $SERVER_LOG) =="
deno run -A main.ts >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

READY=0
for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${PORT}/" -o /dev/null 2>/dev/null; then
        READY=1
        break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
    fi
    sleep 0.5
done

if [[ "$READY" != "1" ]]; then
    echo "Testserver ist nicht gestartet — Log:" >&2
    cat "$SERVER_LOG" >&2
    exit 1
fi

echo "== Browser-Flows =="
set +e
deno test -A test/e2e/browser_flows.ts
TEST_EXIT_CODE=$?
set -e

if [[ "$TEST_EXIT_CODE" != "0" ]]; then
    echo "== Server-Log ==" >&2
    cat "$SERVER_LOG" >&2
fi

exit "$TEST_EXIT_CODE"
