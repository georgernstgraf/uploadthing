WITH moved_rows AS (
    DELETE FROM registrations
    RETURNING *
)
INSERT INTO forensic_registrations
SELECT * FROM moved_rows;