#!/bin/sh
. "/home/georg/.deno/env"
exec > startloop.log
exec 2>&1
while true
do
deno run -A --env-file main.ts
# deno task start
sleep 2
done
