import config from "../lib/config.ts";
import { AppError } from "../lib/errors.ts";
import {
    get_unterlagen,
    pathExists,
    safeFileComponent,
    writeAll,
} from "../lib/pathfuncs.ts";
import { validateUploadedFileType } from "../lib/upload_filetype.ts";

/**
 * Verwaltung der Prüfungsunterlagen direkt aus der Weboberfläche (#134).
 *
 * Die Ablage bleibt bewusst flach in `UNTERLAGEN_DIR`: Unterlagen werden
 * über Examenstermine hinweg wiederverwendet, deshalb gibt es weder
 * Unterordner pro Termin noch Versionierung und kein Archiv. Ersetzt wird
 * nur mit ausdrücklicher Bestätigung, gelöscht wird einzeln oder komplett.
 *
 * Dateinamen laufen ausschließlich über `safeFileComponent`; Pfadtrenner
 * und `..` können dadurch nicht in einen Pfad gelangen. Geschrieben wird
 * nur innerhalb von `UNTERLAGEN_DIR`, und ein vorhandener Symlink wird
 * nicht als Schreibziel akzeptiert.
 */

const MB = 1024 * 1024;

/** Dateien, die Schüler auf der Startseite sehen (#146). */
export async function list(): Promise<string[]> {
    return await get_unterlagen();
}

function allowedExtensions(): string[] {
    return config.UNTERLAGEN_PERMITTED_FILETYPES;
}

function allowedLabel(): string {
    return allowedExtensions().map((extension) => `.${extension}`).join(", ");
}

function extensionOf(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot <= 0) {
        return "";
    }
    return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Löst einen aus dem Formular geposteten Dateinamen gegen das Verzeichnis
 * auf. Akzeptiert wird nur, was tatsächlich als flache Datei dort liegt:
 * `safeFileComponent` ist der Regelfall (so werden Uploads gespeichert),
 * zusätzlich bleibt ein Altbestand aus der Zeit der manuellen
 * SSH-Kopien (z. B. Namen mit Leerzeichen) erreichbar. Beide Wege liefern
 * ausschließlich Namen aus dem Verzeichnislisting, also niemals Pfadteile.
 */
async function resolveExisting(
    rawName: string,
): Promise<{ name: string; path: string }> {
    const safeName = safeFileComponent(rawName);
    const files = await get_unterlagen();

    let name: string | null = null;
    if (safeName && files.includes(safeName)) {
        name = safeName;
    } else if (files.includes(rawName)) {
        name = rawName;
    }

    if (!name) {
        throw new AppError(
            `Die Unterlage ${rawName} gibt es nicht (mehr).`,
            404,
        );
    }

    return { name, path: `${config.UNTERLAGEN_DIR}/${name}` };
}

async function writeFile(file: File, target: string): Promise<void> {
    let out: Deno.FsFile | null = null;
    try {
        out = await Deno.open(target, {
            create: true,
            write: true,
            truncate: true,
        });

        const reader = file.stream().getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            await writeAll(out, value);
        }
    } catch (error) {
        try {
            out?.close();
        } catch {
            // ignore
        }
        try {
            await Deno.remove(target);
        } catch {
            // ignore
        }
        throw new AppError(
            `Die Unterlage konnte nicht gespeichert werden: ${
                (error as Error).message
            }`,
            500,
        );
    } finally {
        try {
            out?.close();
        } catch {
            // ignore
        }
    }
}

/**
 * Legt eine Unterlage an oder ersetzt sie (nur mit `replaceExisting`).
 * Gibt den gespeicherten Dateinamen zurück.
 */
export async function upload(
    file: File,
    replaceExisting = false,
): Promise<string> {
    if (file.size === 0) {
        throw new AppError("Die ausgewählte Datei ist leer.", 400);
    }

    if (file.size > config.MAX_UPLOAD_MB * MB) {
        throw new AppError(
            `Es sind maximal ${config.MAX_UPLOAD_MB} MB möglich.`,
            413,
        );
    }

    const extension = extensionOf(file.name);
    if (!extension) {
        throw new AppError(
            "Die Datei hat keine Dateiendung — bitte eine Angabe mit .md hochladen.",
            415,
        );
    }

    if (!allowedExtensions().includes(extension)) {
        throw new AppError(
            `Für Unterlagen sind nur ${allowedLabel()} Dateien erlaubt.`,
            415,
        );
    }

    // Inhalt prüfen, nicht nur die Endung (wie bei Abgaben).
    await validateUploadedFileType(file, extension);

    const filename = safeFileComponent(file.name);
    if (!filename || filename === "." || /^[._]/.test(filename)) {
        // Namen mit führendem Punkt/Unterstrich sind auf der Schülerseite
        // ausgeblendet und wären danach nicht mehr verwaltbar.
        throw new AppError(
            `Der Dateiname „${file.name}“ ist nicht zulässig. Bitte eine Datei mit sichtbarem Namen hochladen.`,
            400,
        );
    }

    const target = `${config.UNTERLAGEN_DIR}/${filename}`;

    if (await pathExists(target)) {
        const info = await Deno.lstat(target);
        if (!info.isFile) {
            throw new AppError(
                `Die Unterlage ${filename} ist keine reguläre Datei und wird nicht überschrieben.`,
                400,
            );
        }

        if (!replaceExisting) {
            throw new AppError(
                `Die Unterlage ${filename} existiert bereits. Zum Ersetzen bitte „Vorhandene Datei ersetzen“ anhaken und erneut hochladen.`,
                409,
            );
        }
    }

    await writeFile(file, target);
    return filename;
}

/** Löscht genau eine Unterlage. */
export async function remove(rawName: string): Promise<string> {
    const { name, path } = await resolveExisting(rawName);
    try {
        await Deno.remove(path);
    } catch (error) {
        throw new AppError(
            `Die Unterlage ${name} konnte nicht gelöscht werden: ${
                (error as Error).message
            }`,
            500,
        );
    }
    return name;
}

/** Löscht alle Unterlagen; gibt die Anzahl der gelöschten Dateien zurück. */
export async function removeAll(): Promise<number> {
    let removed = 0;
    try {
        for await (const entry of Deno.readDir(config.UNTERLAGEN_DIR)) {
            if (!entry.isFile) {
                // Flache Ablage: Unterordner und Symlinks bleiben unberührt.
                continue;
            }
            await Deno.remove(`${config.UNTERLAGEN_DIR}/${entry.name}`);
            removed += 1;
        }
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return 0;
        }
        throw new AppError(
            `Die Unterlagen konnten nicht gelöscht werden: ${
                (error as Error).message
            }`,
            500,
        );
    }
    return removed;
}
