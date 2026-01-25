#!/usr/bin/env bash

set -euo pipefail

pids=$(fuser -f uploadthing.db 2>/dev/null | tr -d "\n")

if [ -z "${pids}" ]; then
	exit 0
fi

kill ${pids}
sleep 0.5
kill -9 ${pids}
