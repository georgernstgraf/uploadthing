/**
 * Fixture-Datenbank für die E2E-Smoke-Suite (#135).
 *
 * Läuft **vor** dem Serverstart (siehe `scripts/e2e.sh`): legt aus
 * `vacuum.db` eine Wegwerf-Datenbank an, spielt die Migrationen ein und
 * legt die Benutzer an, für die die Suite Sitzungs-Cookies signiert.
 * So schreibt während des Browserlaufs nur noch der Server selbst in die
 * Datenbank — keine konkurrierenden Verbindungen, keine Sperren.
 */

import { parseSqliteDatabaseUrl } from "../../lib/dbpath.ts";
import { STUDENT, TEACHER, UNTERLAGEN_FILE } from "./fixtures.ts";

const VACUUM_DB = new URL("../../vacuum.db", import.meta.url);

function requireEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new Error(`${name} muss gesetzt sein (scripts/e2e.sh).`);
    }
    return value;
}

const databasePath = parseSqliteDatabaseUrl(requireEnv("DATABASE_URL"));

try {
    await Deno.remove(databasePath);
} catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
    }
}

await Deno.copyFile(VACUUM_DB, databasePath);

// Erst nach dem Kopieren importieren: `repo/db.ts` öffnet die Datei und
// spielt beim Laden die Migrationen ein (examstate, adminmac, …).
const { db } = await import("../../repo/db.ts");
const usersRepo = await import("../../repo/users.ts");

// `vacuum.db` ist der saubere Ausgangszustand; die DELETEs machen den
// Lauf auch dann deterministisch, wenn eine alte Arbeitsdatei überlebt.
db.exec("DELETE FROM examstate");
db.exec("DELETE FROM abgaben");
db.exec("DELETE FROM registrations");
db.exec("DELETE FROM cookiepresents");
db.exec("DELETE FROM ipfact");

for (const user of [STUDENT, TEACHER]) {
    await usersRepo.upsert(user);
}

// Eine echte Unterlage, damit der 403-Test auf eine existierende Datei
// zeigt (der Riegel greift vor dem Dateizugriff, nicht wegen 404).
const unterlagenDir = requireEnv("UNTERLAGEN_DIR");
await Deno.mkdir(unterlagenDir, { recursive: true });
await Deno.writeTextFile(
    `${unterlagenDir}/${UNTERLAGEN_FILE}`,
    "# Angabe\n\nFixture der E2E-Suite.\n",
);

db.close();
console.log(`E2E-Fixture-Datenbank vorbereitet: ${databasePath}`);
