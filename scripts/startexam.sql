#!/usr/bin/env bash
cd || exit

echo 'WITH moved_rows AS (
    DELETE FROM registrations
    RETURNING *
)
INSERT INTO forensic_registrations
SELECT * FROM moved_rows;' | sqlite3 ../uploadthing.db