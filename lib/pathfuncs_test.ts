import { assertEquals } from "@std/assert";
import { safeFileComponent, splitFilename } from "./pathfuncs.ts";

Deno.test("splitFilename - splits filename with extension", () => {
    const result = splitFilename("document.pdf");
    assertEquals(result.stem, "document");
    assertEquals(result.ext, ".pdf");
});

Deno.test("splitFilename - handles multiple dots", () => {
    const result = splitFilename("archive.tar.gz");
    assertEquals(result.stem, "archive.tar");
    assertEquals(result.ext, ".gz");
});

Deno.test("splitFilename - handles file without extension", () => {
    const result = splitFilename("Makefile");
    assertEquals(result.stem, "Makefile");
    assertEquals(result.ext, "");
});

Deno.test("splitFilename - handles hidden file", () => {
    const result = splitFilename(".gitignore");
    assertEquals(result.stem, ".gitignore");
    assertEquals(result.ext, "");
});

Deno.test("splitFilename - handles single char extension", () => {
    const result = splitFilename("a.b");
    assertEquals(result.stem, "a");
    assertEquals(result.ext, ".b");
});

Deno.test("splitFilename - handles leading dot only", () => {
    const result = splitFilename(".env");
    assertEquals(result.stem, ".env");
    assertEquals(result.ext, "");
});

Deno.test("safeFileComponent - replaces forward slashes", () => {
    const result = safeFileComponent("path/to/file.txt");
    assertEquals(result, "path_to_file.txt");
});

Deno.test("safeFileComponent - replaces backslashes", () => {
    const result = safeFileComponent("path\\to\\file.txt");
    assertEquals(result, "path_to_file.txt");
});

Deno.test("safeFileComponent - replaces path traversal", () => {
    const result = safeFileComponent("../../../etc/passwd");
    assertEquals(result, "______etc_passwd");
});

Deno.test("safeFileComponent - replaces double dots in middle", () => {
    const result = safeFileComponent("file..name.txt");
    assertEquals(result, "file_name.txt");
});

Deno.test("safeFileComponent - replaces spaces", () => {
    const result = safeFileComponent("my file name.txt");
    assertEquals(result, "my_file_name.txt");
});

Deno.test("safeFileComponent - replaces multiple spaces", () => {
    const result = safeFileComponent("my   file   name.txt");
    assertEquals(result, "my_file_name.txt");
});

Deno.test("safeFileComponent - handles unicode characters", () => {
    const result = safeFileComponent("Ärgerlich.txt");
    assertEquals(result, "Ärgerlich.txt");
});

Deno.test("safeFileComponent - combines multiple replacements", () => {
    const result = safeFileComponent("path/to/my file..name.txt");
    assertEquals(result, "path_to_my_file_name.txt");
});

Deno.test("safeFileComponent - handles empty string", () => {
    const result = safeFileComponent("");
    assertEquals(result, "");
});

Deno.test("safeFileComponent - handles special characters", () => {
    const result = safeFileComponent("file@#$%.txt");
    assertEquals(result, "file@#$%.txt");
});
