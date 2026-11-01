#!/bin/bash

set -veuo pipefail

# Betriebs-/Testwerte kommen NIE aus dem Repo-Verzeichnis (#168): die
# `.env` im Arbeitsbaum enthielt den OPNsense-Root-Key und die gültigen
# Dienstpasswörter und war zudem 644. Reihenfolge:
#   1. `$UPLOADTHING_TEST_ENV`, wenn gesetzt
#   2. eine lokale `.env` im Repo-Verzeichnis (fremde Checkouts, CI)
#   3. `~/.config/uploadthing/test.env` (600, dell)
# `set +v` um das Sourcing: `-v` protokolliert sonst jede Zuweisung der
# gesourcten Datei — so landeten Schlüssel in /tmp/146-*.log.
ENV_FILE="${UPLOADTHING_TEST_ENV:-}"
if [[ -z "$ENV_FILE" ]]; then
	if [[ -f .env ]]; then ENV_FILE=.env; else ENV_FILE="$HOME/.config/uploadthing/test.env"; fi
fi
if [[ ! -f "$ENV_FILE" ]]; then
	echo "Keine Env-Datei gefunden (weder \$UPLOADTHING_TEST_ENV, .env noch ~/.config/uploadthing/test.env)." >&2
	exit 1
fi
set +v
set -a
source "$ENV_FILE"
set +a
set -v
echo "Env-Datei: $ENV_FILE"

# Kein MikroTik-Polling im Testlauf: der Dienst schreibt sonst echte
# WLAN-Clients in die Test-Datenbank und die Tests werden nicht mehr
# deterministisch. Deno überschreibt gesetzte Shell-Variablen nicht
# aus der --env-file, deshalb reicht ein leeres Setzen.
export TIK_URL=""
export TIK_USER=""
export TIK_PASSWORD=""

# Auch die OPNsense-API bleibt im Testlauf aus: der Testserver darf die
# Sperrregel auf der Produktions-Sense nicht lesen oder schalten. Die
# Tests erwarten ohnehin den Zustand „nicht konfiguriert".
export OPNSENSE_API_URL=""
export OPNSENSE_API_KEY=""
export OPNSENSE_API_SECRET=""
export OPNSENSE_EXAMMODE_RULE_UUID=""

# set up a running dev server
fuser -k ${LISTEN_PORT}/tcp && (
	echo "Killed existing process on port ${LISTEN_PORT}, waiting .."
	sleep 1
)
fuser -k -9 ${LISTEN_PORT}/tcp && (
	echo "Killed -9 existing process on port ${LISTEN_PORT}, waiting .."
	sleep .3
)
deno task start >/tmp/${LISTEN_HOST}.log 2>&1 &
echo "waiting, log is in /tmp/${LISTEN_HOST}.log"
sleep 2

# run the tests to stdout
deno test -A --env-file
TEST_EXIT_CODE=$?

# kill the dev server again
fuser -k ${LISTEN_PORT}/tcp && (
	echo "Killed existing process on port ${LISTEN_PORT}, waiting .."
	sleep 1
)
fuser -k -9 ${LISTEN_PORT}/tcp && echo "Killed -9 existing process on port ${LISTEN_PORT}, waiting .."
exit $TEST_EXIT_CODE
