#!/usr/bin/env bash
cd || exit
echo 'BEGIN TRANSACTION;
INSERT INTO forensic_registrations SELECT * FROM registrations;
DELETE FROM registrations;
COMMIT;' \
| tee /dev/tty | sqlite3 ~/uploadthing/uploadthing.db
