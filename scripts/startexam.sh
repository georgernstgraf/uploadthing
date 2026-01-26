#!/usr/bin/env bash
set -euo pipefail
cd

echo "snapshotting home directory..."
datestr=$(date -Iminutes | awk -v 'FS=+' '{print $1}')
zfs snap zroot/home/georg@$datestr

echo "clearing abgaben folder..."
rm -f abgaben/*

echo "archiving and clearing forensic registrations..."
echo 'BEGIN TRANSACTION;
INSERT INTO forensic_registrations SELECT * FROM registrations;
DELETE FROM registrations;
COMMIT;' \
| tee /dev/tty | sqlite3 ~/uploadthing/uploadthing.db
