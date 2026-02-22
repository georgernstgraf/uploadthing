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

export function wipeAbgabenDirectory(dirPath: string): void {
    try {
        for (const dirEntry of Deno.readDirSync(dirPath)) {
            Deno.removeSync(`${dirPath}/${dirEntry.name}`, { recursive: true });
        }
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
            Deno.mkdirSync(dirPath, { recursive: true });
        } else {
            console.error(`Error wiping directory ${dirPath}:`, e);
            throw e;
        }
    }
}
