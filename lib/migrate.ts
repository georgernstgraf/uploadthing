import type { Database } from "@db/sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Migrations-Runner für die Drizzle-Migrationen.
 *
 * Warum ein eigener Runner? `drizzle-kit` bringt esbuild-Binaries mit und
 * läuft deshalb nur auf dem Entwicklungsrechner. Auf der Appliance
 * (FreeBSD/OPNsense) spielt dieser Runner die erzeugten SQL-Dateien über
 * `@db/sqlite` ein — es kommt kein Node-Binary auf die Firewall (#133).
 *
 * Verbindliches Verhalten:
 *
 * - **Idempotent:** bereits verbuchte Migrationen werden übersprungen.
 * - **Exklusiv:** alle Migrationen laufen in einer Transaktion
 *   (`BEGIN EXCLUSIVE`); bei einem Fehler wird alles zurückgerollt.
 * - **Forward-only:** es gibt keine Down-Migrationen. Rückweg ist das
 *   DB-Backup (#148).
 * - **Baseline statt Neuaufbau:** die erste Migration beschreibt den
 *   Ist-Zustand. Existiert dieser Zustand bereits (bestehende
 *   Installation), wird sie nur als angewendet verbucht und nicht
 *   ausgeführt.
 * - **Drizzle-kompatibles Journal:** die Tabelle `__drizzle_migrations`
 *   wird mit Format, Hash (SHA-256 über den Dateiinhalt) und `created_at`
 *   (Journal-`when`) von `drizzle-kit` geschrieben, damit `drizzle-kit
 *   migrate` auf dem Entwicklungsrechner denselben Stand sieht.
 * - **Kein stiller Halbstart:** kennt die Datenbank Migrationen, die dieser
 *   Programmstand nicht hat, verweigert der Start mit deutscher Meldung.
 */

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
export const MIGRATIONS_TABLE = "__drizzle_migrations";
export const MIGRATIONS_DIR = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "drizzle",
);

type JournalEntry = {
    idx: number;
    when: number;
    tag: string;
};

type Journal = {
    entries: JournalEntry[];
};

export type Migration = {
    /** Dateiname ohne `.sql`, z. B. `0000_baseline`. */
    tag: string;
    /** Journal-Zeitstempel in Millisekunden — Drizzles `created_at`. */
    when: number;
    /** SHA-256 (hex) über den unveränderten Dateiinhalt. */
    hash: string;
    statements: string[];
};

export type MigrationOutcome = {
    /** Migrationen, deren SQL ausgeführt wurde. */
    applied: string[];
    /** Migrationen, die nur als angewendet verbucht wurden (Baseline). */
    marked: string[];
    /** Migrationen, die bereits verbucht waren. */
    skipped: string[];
};

type RunOptions = {
    /** Verzeichnis mit `meta/_journal.json` und den `.sql`-Dateien. */
    dir?: string;
    /** Ausgabe pro Migration; standardmäßig `console.log`. */
    log?: (message: string) => void;
};

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
    const journalPath = join(dir, "meta", "_journal.json");
    if (!existsSync(journalPath)) {
        throw new Error(
            `Migrations-Journal fehlt: ${journalPath}. Ohne Journal kann nicht migriert werden.`,
        );
    }

    const journal = JSON.parse(
        Deno.readTextFileSync(journalPath),
    ) as Journal;

    return [...journal.entries]
        .sort((a, b) => a.when - b.when)
        .map((entry) => {
            const sqlPath = join(dir, `${entry.tag}.sql`);
            if (!existsSync(sqlPath)) {
                throw new Error(
                    `Migrationsdatei fehlt: ${sqlPath} (Journal-Eintrag ${entry.tag}).`,
                );
            }
            const sql = Deno.readTextFileSync(sqlPath);
            return {
                tag: entry.tag,
                when: entry.when,
                hash: createHash("sha256").update(sql).digest("hex"),
                statements: sql
                    .split(STATEMENT_BREAKPOINT)
                    .map((statement) => statement.trim())
                    .filter(Boolean),
            };
        });
}

export function runMigrations(
    db: Database,
    options: RunOptions = {},
): MigrationOutcome {
    const log = options.log ?? ((message: string) => console.log(message));
    const migrations = loadMigrations(options.dir);
    const outcome: MigrationOutcome = { applied: [], marked: [], skipped: [] };

    // Exakt das DDL, das Drizzle selbst anlegt (sqlite-core/dialect.ts).
    db.exec(`
        CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at numeric
        )
    `);

    // Nur der Hash wird gelesen: `created_at` liegt in Millisekunden und
    // wird von `@db/sqlite` beim Lesen als int32 abgeschnitten (siehe
    // docs/ai/PITFALLS.md). Für die Anwendung zählt der Hash.
    const appliedHashRows = db
        .prepare(`SELECT hash FROM "${MIGRATIONS_TABLE}"`)
        .all() as { hash: string }[];

    const knownHashes = new Set(migrations.map((migration) => migration.hash));
    const unknown = appliedHashRows.filter((row) => !knownHashes.has(row.hash));
    if (unknown.length > 0) {
        throw new Error(
            `Die Datenbank wurde mit einer neueren Version von Uploadthing migriert ` +
                `(${unknown.length} unbekannte Migration(en) in ${MIGRATIONS_TABLE}). ` +
                `Der Start wird abgebrochen, damit kein halb migriertes Schema entsteht — ` +
                `bitte die neuere Programmversion verwenden.`,
        );
    }

    const appliedHashes = new Set(appliedHashRows.map((row) => row.hash));
    const pending = migrations.filter(
        (migration) => !appliedHashes.has(migration.hash),
    );

    for (const migration of migrations) {
        if (appliedHashes.has(migration.hash)) {
            outcome.skipped.push(migration.tag);
        }
    }

    if (pending.length === 0) {
        return outcome;
    }

    db.exec("BEGIN EXCLUSIVE");
    try {
        for (const migration of pending) {
            const isBaseline = migration === migrations[0];
            const alreadyThere = isBaseline && schemaMatchesBaseline(db, migration);

            if (!alreadyThere) {
                for (const statement of migration.statements) {
                    db.exec(statement);
                }
            }

            db.prepare(
                `INSERT INTO "${MIGRATIONS_TABLE}" (hash, created_at) VALUES (?, ?)`,
            ).run(migration.hash, migration.when);

            if (alreadyThere) {
                outcome.marked.push(migration.tag);
                log(
                    `Migration ${migration.tag}: Schema ist bereits vorhanden — als angewendet markiert (Baseline).`,
                );
            } else {
                outcome.applied.push(migration.tag);
                log(
                    `Migration ${migration.tag}: angewendet (${migration.statements.length} Statements).`,
                );
            }
        }
        db.exec("COMMIT");
    } catch (error) {
        db.exec("ROLLBACK");
        throw new Error(
            `Migration fehlgeschlagen, Datenbank unverändert: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }

    return outcome;
}

/**
 * Prüft, ob die Baseline-Objekte bereits vollständig in der Datenbank
 * liegen. Nur dann wird die Baseline in einer bestehenden Installation
 * nicht ausgeführt, sondern direkt verbucht. Fehlt auch nur ein Objekt
 * (z. B. eine ältere Installation ohne `examstate` oder ohne die
 * Forensik-Indizes), läuft die idempotente Baseline und gleicht die
 * Datenbank an.
 */
function schemaMatchesBaseline(db: Database, migration: Migration): boolean {
    const probe = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE name = ? LIMIT 1",
    );
    const exists = (name: string): boolean => probe.get(name) !== undefined;

    for (const statement of migration.statements) {
        const created = /CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([^`"\s(]+)/i
            .exec(statement);
        if (created && created[1] !== MIGRATIONS_TABLE && !exists(created[1])) {
            return false;
        }

        const dropped = /DROP\s+(?:TABLE|INDEX)\s+(?:IF\s+EXISTS\s+)?[`"]?([^`"\s;]+)/i
            .exec(statement);
        if (dropped && exists(dropped[1])) {
            return false;
        }
    }

    return true;
}

if (import.meta.main) {
    const { Database } = await import("@db/sqlite");
    const { default: config } = await import("./config.ts");

    const db = new Database(config.DATABASE_PATH);
    try {
        const outcome = runMigrations(db);
        console.log(
            `Migrationen für ${config.DATABASE_PATH}: ` +
                `${outcome.applied.length} angewendet, ` +
                `${outcome.marked.length} als angewendet markiert, ` +
                `${outcome.skipped.length} bereits vorhanden.`,
        );
    } catch (error) {
        console.error(
            `Migration abgebrochen: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        Deno.exit(1);
    } finally {
        db.close();
    }
}
