import { assertEquals, assertRejects } from "@std/assert";
import { AppError } from "./errors.ts";
import {
    detectMimeType,
    getAllowedMimeTypesForExtension,
    validateUploadedFileType,
} from "./upload_filetype.ts";

const encoder = new TextEncoder();

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
    0xb7,
    0xac,
    0xce,
    0x34,
    0x00,
    0x00,
    0x00,
    0x00,
]);

const pdfBytes = encoder.encode("%PDF-1.4\n1 0 obj\n");
const markdownBytes = encoder.encode("# Test\n\nHello world\n");

Deno.test("getAllowedMimeTypesForExtension - returns explicit aliases", () => {
    assertEquals(getAllowedMimeTypesForExtension("zip"), [
        "application/zip",
        "application/x-zip-compressed",
        "multipart/x-zip",
    ]);
    assertEquals(getAllowedMimeTypesForExtension("md"), [
        "text/markdown",
        "text/x-markdown",
        "text/plain",
    ]);
});

Deno.test("detectMimeType - detects pdf bytes", async () => {
    const file = new File([pdfBytes], "test.pdf", { type: "application/pdf" });

    const detectedMimeType = await detectMimeType(file);

    assertEquals(detectedMimeType, "application/pdf");
});

Deno.test("validateUploadedFileType - accepts markdown with text/plain", async () => {
    const file = new File([markdownBytes], "test.md", { type: "text/plain" });

    await validateUploadedFileType(file, "md");
});

Deno.test("validateUploadedFileType - accepts zip with matching MIME and content", async () => {
    const file = new File([zipBytes], "test.zip", { type: "application/zip" });

    await validateUploadedFileType(file, "zip");
});

Deno.test("validateUploadedFileType - rejects wrong content type", async () => {
    const file = new File([pdfBytes], "test.pdf", { type: "text/plain" });

    await assertRejects(
        () => validateUploadedFileType(file, "pdf"),
        AppError,
        "Falscher Content-Type",
    );
});

Deno.test("validateUploadedFileType - rejects mismatched detected content", async () => {
    const file = new File([zipBytes], "test.pdf", { type: "application/pdf" });

    await assertRejects(
        () => validateUploadedFileType(file, "pdf"),
        AppError,
        "Der Dateiinhalt passt nicht",
    );
});

Deno.test("validateUploadedFileType - rejects zip without detectable zip content", async () => {
    const file = new File([markdownBytes], "test.zip", { type: "application/zip" });

    await assertRejects(
        () => validateUploadedFileType(file, "zip"),
        AppError,
        "konnte nicht als .zip erkannt werden",
    );
});
