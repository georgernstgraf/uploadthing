-- This is an empty migration.
-- RedefineTables
PRAGMA defer_foreign_keys = ON;

PRAGMA foreign_keys = OFF;

alter table
    history rename to registrations;

PRAGMA foreign_keys = ON;

PRAGMA defer_foreign_keys = OFF;