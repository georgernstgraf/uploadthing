import { assertEquals, assertThrows } from "@std/assert";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    DATABASE_URL_BASE_DIR,
    parseSqliteDatabaseUrl,
} from "./dbpath.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

Deno.test("dbpath - Basisverzeichnis bleibt das frühere prisma/-Verzeichnis", () => {
    // DATABASE_URL-Werte in bestehenden .env-Dateien (auch Produktion) sind
    // relativ zu prisma/ geschrieben; die Auflösung darf sich nicht ändern.
    assertEquals(DATABASE_URL_BASE_DIR, resolve(repoRoot, "prisma"));
});

Deno.test("dbpath - parses Prisma-style SQLite URL", () => {
    assertEquals(
        parseSqliteDatabaseUrl("file:../uploadthing.db"),
        resolve(repoRoot, "uploadthing.db"),
    );
    assertEquals(
        parseSqliteDatabaseUrl("file:./tmp/test.db"),
        resolve(repoRoot, "prisma", "tmp", "test.db"),
    );
});

Deno.test("dbpath - rejects empty string", () => {
    assertThrows(
        () => parseSqliteDatabaseUrl(""),
        Error,
        "DATABASE_URL must be set to a Prisma-style SQLite file: URL.",
    );
});

Deno.test("dbpath - rejects non-file URLs", () => {
    for (const invalid of ["uploadthing.db", "postgres://localhost/app"]) {
        assertThrows(
            () => parseSqliteDatabaseUrl(invalid),
            Error,
            "DATABASE_URL must use a Prisma-style SQLite file: URL.",
        );
    }
});
