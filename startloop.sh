#!/bin/sh
. "/home/georg/.deno/env"
exec > startloop.log
exec 2>&1
while true
do
deno task start
sleep 2
done
