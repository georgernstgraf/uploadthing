#!/usr/bin/env bash

set -euo pipefail

cd
stop.sh
cd uploadthing
git pull
rm STOPPED

