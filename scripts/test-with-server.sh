#!/bin/bash

set -veuo pipefail
source .env

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
