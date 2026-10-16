#!/bin/sh
logdir=/var/log/exampy
filename=$(date "+%Y-%m-%d_%H:%M:%S").log
exec 1>>${logdir}/scan_cron.log 2>&1
/root/bin/scan.py
