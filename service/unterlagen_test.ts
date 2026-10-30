import { assert, assertEquals, assertRejects } from "@std/assert";
import config from "../lib/config.ts";
import { AppError } from "../lib/errors.ts";
import { list, remove, removeAll, upload } from "./unterlagen.ts";

/**
 * Tests laufen gegen ein temporäres Verzeichnis: das echte
 * `UNTERLAGEN_DIR` gehört zum Entwicklungscheckout und darf von Tests
 * nicht geleert werden. `config` ist ein veränderbares Objekt (wie bei
 * `PERMITTED_FILETYPES`), die Originalwerte werden wiederhergestellt.
 */
async function withUnterlagenDir(
    fn: (dir: string, parent: string) => Promise<void>,
): Promise<void> {
    const originalDir = config.UNTERLAGEN_DIR;
    const originalTypes = [...config.UNTERLAGEN_PERMITTED_FILETYPES];
    const parent = await Deno.makeTempDir({ prefix: "unterlagen-test-" });
    const dir = `${parent}/unterlagen`;
    await Deno.mkdir(dir);

    config.UNTERLAGEN_DIR = dir;
    config.UNTERLAGEN_PERMITTED_FILETYPES = ["md"];

    try {
        await fn(dir, parent);
    } finally {
        config.UNTERLAGEN_DIR = originalDir;
        config.UNTERLAGEN_PERMITTED_FILETYPES = originalTypes;
        await Deno.remove(parent, { recursive: true });
    }
}

function mdFile(name: string, content = "# Angabe\n"): File {
    return new File([content], name, { type: "text/markdown" });
}

Deno.test("unterlagen - Admin-Upload legt die Datei flach im Verzeichnis an", async () => {
    await withUnterlagenDir(async (dir) => {
        const filename = await upload(mdFile("angabe.md"));

        assertEquals(filename, "angabe.md");
        assertEquals(await Deno.readTextFile(`${dir}/angabe.md`), "# Angabe\n");
        assertEquals(await list(), ["angabe.md"]);
    });
});

Deno.test("unterlagen - Dateiname wird über safeFileComponent saniert", async () => {
    await withUnterlagenDir(async (dir) => {
        const filename = await upload(mdFile("Angabe HTL.md"));

        assertEquals(filename, "Angabe_HTL.md");
        assertEquals(await list(), ["Angabe_HTL.md"]);

        const entries: string[] = [];
        for await (const entry of Deno.readDir(dir)) {
            entries.push(entry.name);
        }
        assertEquals(entries, ["Angabe_HTL.md"]);
    });
});

Deno.test("unterlagen - Pfadanteile landen nicht außerhalb des Verzeichnisses", async () => {
    await withUnterlagenDir(async (_dir, parent) => {
        const filename = await upload(mdFile("kapitel/angabe.md"));

        // Kein Unterordner, keine zweite Ebene: der Trenner wird ersetzt.
        assertEquals(filename, "kapitel_angabe.md");
        assertEquals(await list(), ["kapitel_angabe.md"]);

        // „..“ wird zu einem Punkt zusammengezogen; ein Name, der danach
        // versteckt beginnt, wird komplett abgelehnt — nichts entwischt.
        await assertRejects(
            () => upload(mdFile("../../entwischt.md")),
            AppError,
            "ist nicht zulässig",
        );
        assertEquals(await list(), ["kapitel_angabe.md"]);
        await assertRejects(() => Deno.stat(`${parent}/entwischt.md`));
    });
});

Deno.test("unterlagen - Dateityp außerhalb von UNTERLAGEN_PERMITTED_FILETYPES wird abgelehnt", async () => {
    await withUnterlagenDir(async (dir) => {
        await assertRejects(
            () => upload(mdFile("angabe.txt", "# Angabe\n")),
            AppError,
            "Für Unterlagen sind nur .md Dateien erlaubt.",
        );
        assertEquals(await list(), []);
        await assertRejects(() => Deno.stat(`${dir}/angabe.txt`));
    });
});

Deno.test("unterlagen - Inhalt muss zur Endung passen (Content-Sniffing)", async () => {
    await withUnterlagenDir(async () => {
        const zipBytes = Uint8Array.from([
            0x50,
            0x4b,
            0x03,
            0x04,
            0x14,
            0x00,
            0x00,
            0x00,
            0x08,
            0x00,
        ]);
        const zipAsMd = new File([zipBytes], "angabe.md", {
            type: "text/markdown",
        });

        await assertRejects(
            () => upload(zipAsMd),
            AppError,
            "Der Dateiinhalt passt nicht zu .md.",
        );
        assertEquals(await list(), []);
    });
});

Deno.test("unterlagen - Ersetzen nur mit Bestätigung", async () => {
    await withUnterlagenDir(async (dir) => {
        await upload(mdFile("angabe.md", "# Alt\n"));

        await assertRejects(
            () => upload(mdFile("angabe.md", "# Neu\n")),
            AppError,
            "existiert bereits",
        );
        assertEquals(await Deno.readTextFile(`${dir}/angabe.md`), "# Alt\n");

        const filename = await upload(mdFile("angabe.md", "# Neu\n"), true);
        assertEquals(filename, "angabe.md");
        assertEquals(await Deno.readTextFile(`${dir}/angabe.md`), "# Neu\n");
        assertEquals(await list(), ["angabe.md"]);
    });
});

Deno.test("unterlagen - Löschen einzeln und alles", async () => {
    await withUnterlagenDir(async () => {
        await upload(mdFile("angabe.md"));
        await upload(mdFile("loesung.md"));

        assertEquals(await remove("angabe.md"), "angabe.md");
        assertEquals(await list(), ["loesung.md"]);
        await assertRejects(
            () => remove("angabe.md"),
            AppError,
            "gibt es nicht (mehr)",
        );

        assertEquals(await removeAll(), 1);
        assertEquals(await list(), []);
        assertEquals(await removeAll(), 0);
    });
});

Deno.test("unterlagen - Löschen akzeptiert keine Pfadanteile", async () => {
    await withUnterlagenDir(async (dir, parent) => {
        await Deno.writeTextFile(`${dir}/angabe.md`, "# Angabe\n");
        await Deno.writeTextFile(`${parent}/ausserhalb.md`, "# Fremd\n");

        await assertRejects(
            () => remove("../ausserhalb.md"),
            AppError,
            "gibt es nicht (mehr)",
        );
        assert((await Deno.stat(`${parent}/ausserhalb.md`)).isFile);

        // `removeAll` fasst nur Dateien im Verzeichnis an.
        assertEquals(await removeAll(), 1);
        assert((await Deno.stat(`${parent}/ausserhalb.md`)).isFile);
    });
});

Deno.test("unterlagen - nicht sichtbare Namen werden beim Upload abgelehnt", async () => {
    await withUnterlagenDir(async () => {
        await assertRejects(
            () => upload(mdFile("_temp.md")),
            AppError,
            "ist nicht zulässig",
        );
        await assertRejects(
            () => upload(mdFile(".versteckt.md")),
            AppError,
            "ist nicht zulässig",
        );
        assertEquals(await list(), []);
    });
});
