import { assert, assertEquals, assertThrows } from "@std/assert";
import { Database } from "@db/sqlite";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
    loadMigrations,
    MIGRATIONS_DIR,
    MIGRATIONS_TABLE,
    runMigrations,
} from "./migrate.ts";

const quiet = () => {};

async function withTempDb(
    fn: (db: Database) => void,
): Promise<void> {
    const dir = await Deno.makeTempDir({ prefix: "uploadthing-migrate-" });
    const db = new Database(join(dir, "test.db"));
    try {
        fn(db);
    } finally {
        db.close();
        await Deno.remove(dir, { recursive: true });
    }
}

function objectNames(db: Database, type: "table" | "index"): string[] {
    const rows = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name",
        )
        .all(type) as { name: string }[];
    return rows.map((row) => row.name);
}

function appliedRows(
    db: Database,
): { hash: string; created_at: string }[] {
    return db
        .prepare(
            `SELECT hash, CAST(created_at AS TEXT) AS created_at FROM "${MIGRATIONS_TABLE}"`,
        )
        .all() as { hash: string; created_at: string }[];
}

const EXPECTED_TABLES = [
    "abgaben",
    "cookiepresents",
    "examstate",
    "ipfact",
    "registrations",
    "users",
];

const EXPECTED_INDEXES = [
    "abgaben_at_idx",
    "abgaben_ip_at_idx",
    "abgaben_userId_idx",
    "cookiepresents_ip_at_idx",
    "cookiepresents_userId_idx",
    "ipfact_ip_seen_key",
    "ipfact_seen_ip_idx",
    "registrations_ip_at_idx",
    "registrations_userId_idx",
    "users_email_key",
];

Deno.test("migrate - loadMigrations liefert alle Migrationen aus dem Journal", () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    assertEquals(migrations.length, 2);
    assertEquals(migrations[0].tag, "0000_baseline");
    assertEquals(migrations[1].tag, "0001_ipfact_mac");
    assertEquals(
        migrations[0].hash,
        createHash("sha256")
            .update(Deno.readTextFileSync(join(MIGRATIONS_DIR, "0000_baseline.sql")))
            .digest("hex"),
    );
    assertEquals(migrations[0].statements.length > 10, true);
});

Deno.test("migrate - leere Datenbank wird vollständig aufgebaut", async () => {
    await withTempDb((db) => {
        const outcome = runMigrations(db, { log: quiet });

        assertEquals(outcome.applied, ["0000_baseline", "0001_ipfact_mac"]);
        assertEquals(outcome.marked, []);
        assertEquals(objectNames(db, "table"), EXPECTED_TABLES);
        assertEquals(objectNames(db, "index"), EXPECTED_INDEXES);

        const columns = db.prepare("PRAGMA table_info(ipfact)").all() as {
            name: string;
        }[];
        assertEquals(columns.some((column) => column.name === "mac"), true);
    });
});

Deno.test("migrate - schreibt das Drizzle-Journalformat", async () => {
    await withTempDb((db) => {
        runMigrations(db, { log: quiet });

        const rows = appliedRows(db);
        const migrations = loadMigrations();
        assertEquals(rows.length, migrations.length);
        assertEquals(rows[0].hash, migrations[0].hash);
        assertEquals(rows[0].created_at, String(migrations[0].when));
        assertEquals(rows[1].hash, migrations[1].hash);
        assertEquals(rows[1].created_at, String(migrations[1].when));
    });
});

Deno.test("migrate - zweiter Lauf ist idempotent", async () => {
    await withTempDb((db) => {
        runMigrations(db, { log: quiet });
        const outcome = runMigrations(db, { log: quiet });

        assertEquals(outcome.applied, []);
        assertEquals(outcome.marked, []);
        assertEquals(outcome.skipped, ["0000_baseline", "0001_ipfact_mac"]);
        assertEquals(appliedRows(db).length, 2);
    });
});

Deno.test("migrate - Baseline auf bestehender Datenbank wird markiert, nicht ausgeführt", async () => {
    await withTempDb((db) => {
        runMigrations(db, { log: quiet });
        db.exec(`DELETE FROM "${MIGRATIONS_TABLE}"`);
        // Stand vor #145: ipfact kennt die MAC-Spalte noch nicht.
        db.exec("ALTER TABLE ipfact DROP COLUMN mac");
        db.exec(
            "INSERT INTO users (email, name, updatedat) VALUES ('a@b.at', 'Test', 1)",
        );

        const outcome = runMigrations(db, { log: quiet });

        assertEquals(outcome.applied, ["0001_ipfact_mac"]);
        assertEquals(outcome.marked, ["0000_baseline"]);
        assertEquals(appliedRows(db).length, 2);

        const users = db.prepare("SELECT email FROM users").all() as {
            email: string;
        }[];
        assertEquals(users.length, 1);
    });
});

Deno.test("migrate - ältere Datenbank wird auf den Ist-Zustand gebracht", async () => {
    await withTempDb((db) => {
        runMigrations(db, { log: quiet });
        db.exec(`DELETE FROM "${MIGRATIONS_TABLE}"`);
        // Stand vor den Forensik-Indizes, vor examstate und vor #145.
        db.exec("DROP TABLE examstate");
        db.exec("DROP INDEX abgaben_ip_at_idx");
        db.exec("CREATE INDEX cookiepresents_ip_idx ON cookiepresents (ip)");
        db.exec("ALTER TABLE ipfact DROP COLUMN mac");

        const outcome = runMigrations(db, { log: quiet });

        assertEquals(outcome.applied, ["0000_baseline", "0001_ipfact_mac"]);
        assertEquals(outcome.marked, []);
        assertEquals(objectNames(db, "index"), EXPECTED_INDEXES);
        assert(objectNames(db, "table").includes("examstate"));
        const columns = db.prepare("PRAGMA table_info(ipfact)").all() as {
            name: string;
        }[];
        assertEquals(columns.some((column) => column.name === "mac"), true);
        assertEquals(appliedRows(db).length, 2);
    });
});

Deno.test("migrate - neuere Datenbank verweigert den Start", async () => {
    await withTempDb((db) => {
        runMigrations(db, { log: quiet });
        db.prepare(
            `INSERT INTO "${MIGRATIONS_TABLE}" (hash, created_at) VALUES (?, ?)`,
        ).run("deadbeef", Date.now());

        assertThrows(
            () => runMigrations(db, { log: quiet }),
            Error,
            "neueren Version von Uploadthing",
        );
    });
});

Deno.test("migrate - Fehler in einer Migration rollt alles zurück", async () => {
    const dir = await Deno.makeTempDir({ prefix: "uploadthing-migrate-" });
    const migrationsDir = join(dir, "migrations");
    await Deno.mkdir(join(migrationsDir, "meta"), { recursive: true });
    await Deno.writeTextFile(
        join(migrationsDir, "meta", "_journal.json"),
        JSON.stringify({
            version: "7",
            dialect: "sqlite",
            entries: [{ idx: 0, when: 1, tag: "0000_kaputt", breakpoints: true }],
        }),
    );
    await Deno.writeTextFile(
        join(migrationsDir, "0000_kaputt.sql"),
        "CREATE TABLE `ok` (`id` integer);\n--> statement-breakpoint\n" +
            "CREATE TABLE `ok` (`id` integer);\n",
    );

    const db = new Database(join(dir, "test.db"));
    try {
        assertThrows(
            () => runMigrations(db, { dir: migrationsDir, log: quiet }),
            Error,
            "Datenbank unverändert",
        );
        assertEquals(objectNames(db, "table"), []);
        assertEquals(appliedRows(db), []);
    } finally {
        db.close();
        await Deno.remove(dir, { recursive: true });
    }
});
