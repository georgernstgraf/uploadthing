/**
 * Anrede-Konvention (#158): Die Oberfläche duzt — auch in den
 * Admin-Flows. Deutsch wird ohne Ausnahme informell angesprochen
 * („du/dein"), nie mit „Sie/Ihr".
 *
 * Der Test liest die Quellen, statt Seiten zu rendern: er soll auch
 * Texte erwischen, die nur in einem seltenen Fehlerfall sichtbar werden
 * (Toasts, 4xx-Meldungen, `hx-confirm`-Dialoge). Geprüft werden
 * 1. alle Templates und
 * 2. die String-Literale von `routes/` und `lib/schemas.ts` (dort
 *    stehen die Fehlermeldungen); Kommentare bleiben außen vor, damit
 *    ein deutscher Fließtext im Code den Test nicht färbt.
 */

import { assertEquals } from "@std/assert";

/** Formelle Anrede; „sie" als Pronomen (klein) ist bewusst nicht dabei. */
const FORMAL_ADDRESS = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/;

const TEMPLATES_DIR = new URL("../templates/", import.meta.url);
const ROUTES_DIR = new URL("../routes/", import.meta.url);
const SCHEMAS_FILE = new URL("../lib/schemas.ts", import.meta.url);

/** Alle Dateien eines Verzeichnisses mit der Endung, alphabetisch. */
async function filesIn(dir: URL, suffix: string): Promise<URL[]> {
    const names: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
        if (entry.isFile && entry.name.endsWith(suffix)) {
            names.push(entry.name);
        }
    }
    return names.sort().map((name) => new URL(name, dir));
}

/** Zeilennummer und Zeile eines Treffers, für eine brauchbare Meldung. */
function findFormalAddress(source: string): string[] {
    const hits: string[] = [];
    for (const [index, line] of source.split("\n").entries()) {
        if (FORMAL_ADDRESS.test(line)) {
            hits.push(`Zeile ${index + 1}: ${line.trim()}`);
        }
    }
    return hits;
}

/** String-Literale einer Zeile (`"…"`, `'…'`, `` `…` ``). */
function stringLiterals(line: string): string[] {
    return [...line.matchAll(/["'`]([^"'`]*)["'`]/g)].map((match) => match[1]);
}

Deno.test("UI-Texte: Templates duzen statt siezen", async () => {
    const hits: string[] = [];
    for (const file of await filesIn(TEMPLATES_DIR, ".hbs")) {
        const source = await Deno.readTextFile(file);
        for (const hit of findFormalAddress(source)) {
            hits.push(`${file.pathname.split("/").pop()}: ${hit}`);
        }
    }
    assertEquals(
        hits,
        [],
        `Formelle Anrede in Templates (bitte duzen):\n${hits.join("\n")}`,
    );
});

Deno.test("UI-Texte: Fehlermeldungen in routes/ und schemas.ts duzen", async () => {
    const hits: string[] = [];
    const candidates = [
        ...(await filesIn(ROUTES_DIR, ".ts")),
        SCHEMAS_FILE,
    ];

    for (const file of candidates) {
        const source = await Deno.readTextFile(file);
        const name = file.pathname.split("/").pop();
        for (const [index, line] of source.split("\n").entries()) {
            for (const literal of stringLiterals(line)) {
                if (FORMAL_ADDRESS.test(literal)) {
                    hits.push(`${name}: Zeile ${index + 1}: ${literal}`);
                }
            }
        }
    }

    assertEquals(
        hits,
        [],
        `Formelle Anrede in Meldungen (bitte duzen):\n${hits.join("\n")}`,
    );
});
