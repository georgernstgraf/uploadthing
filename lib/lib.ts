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
