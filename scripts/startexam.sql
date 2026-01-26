#!/usr/bin/env bash
cd || exit
set -v
echo '
BEGIN TRANSACTION;

INSERT INTO forensic_registrations SELECT * FROM registrations;
DELETE FROM registrations;

COMMIT;' \
| sqlite3 ~/uploadthing/uploadthing.db