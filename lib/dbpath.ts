import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Basis für relative `file:`-Pfade in `DATABASE_URL`.
 *
 * Historisch hat Prisma relative SQLite-Pfade relativ zum Verzeichnis des
 * Schemas (`prisma/`) aufgelöst. Damit alle bestehenden `.env`-Dateien —
 * auch die der Produktionsinstallation — unverändert gültig bleiben, gilt
 * diese Auflösung weiter, obwohl `prisma/` seit #133 nicht mehr existiert.
 * Das Verzeichnis muss dafür nicht existieren; `resolve` arbeitet rein
 * textuell.
 *
 * Bewusst `node:path` statt `@std/path`: dieselbe Datei wird auch von
 * `drizzle.config.ts` importiert, das `drizzle-kit` über jiti (Node-
 * Auflösung) lädt — ein jsr-Import wäre dort nicht auflösbar.
 */
export const DATABASE_URL_BASE_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "prisma",
);

/**
 * Wandelt eine Prisma-kompatible SQLite-URL (`file:…`) in einen absoluten
 * Dateipfad um. Andere Schemes sind ein Fehler; die Fehlermeldungen
 * bleiben wortgleich, weil sie in `.env`-Fehldiagnosen zitiert werden.
 */
export function parseSqliteDatabaseUrl(databaseUrl: string): string {
    const trimmed = databaseUrl.trim();
    if (!trimmed) {
        throw new Error(
            "DATABASE_URL must be set to a Prisma-style SQLite file: URL.",
        );
    }

    if (!trimmed.startsWith("file:")) {
        throw new Error(
            "DATABASE_URL must use a Prisma-style SQLite file: URL.",
        );
    }

    const databasePath = trimmed.slice("file:".length);
    if (!databasePath) {
        throw new Error(
            "DATABASE_URL must include a filesystem path after file:.",
        );
    }

    return resolve(DATABASE_URL_BASE_DIR, databasePath);
}
