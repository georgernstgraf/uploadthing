import config from "./config.ts";
export async function get_unterlagen() {
    const files: string[] = [];
    for await (const dirEntry of Deno.readDir(config.UNTERLAGEN_DIR)) {
        if (!dirEntry.name.startsWith(".") && !dirEntry.name.startsWith("_") && dirEntry.isFile) {
            files.push(dirEntry.name);
        }
    }
    files.sort();
    return files;
}

export async function getVersionedPath(
    dir: string,
    filename: string,
): Promise<{ filename: string; outPath: string }> {
    const { stem, ext } = splitFilename(filename);
    let candidate = filename;
    let index = 2;
    while (await pathExists(`${dir}/${candidate}`)) {
        candidate = `${stem}-v${index}${ext}`;
        index += 1;
    }
    return { filename: candidate, outPath: `${dir}/${candidate}` };
}

export function splitFilename(filename: string): { stem: string; ext: string } {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot > 0) {
        return { stem: filename.slice(0, lastDot), ext: filename.slice(lastDot) };
    }
    return { stem: filename, ext: "" };
}

export async function pathExists(path: string): Promise<boolean> {
    try {
        await Deno.stat(path);
        return true;
    } catch (e) {
        if (e instanceof Deno.errors.NotFound) return false;
        throw e;
    }
}
