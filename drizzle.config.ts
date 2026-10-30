/**
 * Konfiguration für `drizzle-kit` — **nur für den Entwicklungsrechner**.
 *
 * `drizzle-kit` bringt esbuild-Binaries mit und läuft deshalb nie auf der
 * Appliance (FreeBSD/OPNsense). Dort spielt ein kleiner TS-Runner
 * (`lib/migrate.ts`) die erzeugten SQL-Migrationen über `@db/sqlite` ein.
 *
 * Aufruf: `deno task db:generate --name <migration_name>`
 */

import { defineConfig } from "drizzle-kit";
import { parseSqliteDatabaseUrl } from "./lib/dbpath.ts";

export default defineConfig({
    dialect: "sqlite",
    schema: "./drizzle/schema.ts",
    out: "./drizzle",
    dbCredentials: {
        url: parseSqliteDatabaseUrl(Deno.env.get("DATABASE_URL") ?? ""),
    },
    strict: true,
    verbose: true,
});
