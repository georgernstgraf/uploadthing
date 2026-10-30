#!/bin/bash

set -veuo pipefail
source .env

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
