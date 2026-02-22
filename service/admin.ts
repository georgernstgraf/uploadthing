import * as repo from "../repo/repo.ts";

export function createDatabaseBackup(destinationPath: string): void {
    try {
        Deno.removeSync(destinationPath);
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) {
            console.error("Error removing old vacuum.db:", e);
        }
    }

    repo.vacuumInto(destinationPath);
}
