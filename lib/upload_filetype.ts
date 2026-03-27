import { parseMediaType, typeByExtension } from "@std/media-types";
import fileType from "file-type";
import { AppError } from "./errors.ts";

const SNIFF_BYTES = 8192;

const explicitMimeMap: Record<string, string[]> = {
    zip: [
        "application/zip",
        "application/x-zip-compressed",
        "multipart/x-zip",
    ],
    pdf: [
        "application/pdf",
        "application/x-pdf",
    ],
    md: [
        "text/markdown",
        "text/x-markdown",
        "text/plain",
    ],
};

const contentDetectionRequired = new Set(["zip", "pdf"]);

function normalizeExtension(extension: string): string {
    return extension.toLowerCase().replace(/^\.+/, "");
}

function normalizeMimeType(mimeType: string): string {
    const trimmed = mimeType.trim().toLowerCase();
    if (!trimmed) {
        return "";
    }
    try {
        return parseMediaType(trimmed)[0].toLowerCase();
    } catch {
        return trimmed.split(";")[0].trim();
    }
}

export function getAllowedMimeTypesForExtension(extension: string): string[] {
    const normalizedExtension = normalizeExtension(extension);
    const explicit = explicitMimeMap[normalizedExtension];
    if (explicit) {
        return explicit;
    }

    const fallbackMime = typeByExtension(normalizedExtension);
    return fallbackMime ? [fallbackMime.toLowerCase()] : [];
}

function formatAllowedMimeTypes(mimeTypes: string[]): string {
    return mimeTypes.join(", ");
}

export async function detectMimeType(file: File): Promise<string | null> {
    const buffer = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    if (buffer.byteLength === 0) {
        return null;
    }

    const detected = await fileType.fromBuffer(buffer);
    return detected?.mime.toLowerCase() ?? null;
}

export async function validateUploadedFileType(
    file: File,
    extension: string,
): Promise<void> {
    const normalizedExtension = normalizeExtension(extension);
    const allowedMimeTypes = getAllowedMimeTypesForExtension(normalizedExtension);
    if (allowedMimeTypes.length === 0) {
        throw new AppError(
            `Für .${normalizedExtension} ist keine Content-Type-Prüfung konfiguriert.`,
            415,
        );
    }

    const declaredMimeType = normalizeMimeType(file.type);

    // For text-based formats (md, txt), browsers often send empty or application/octet-stream
    // We allow these and rely on content detection instead
    const isTextBased = normalizedExtension === "md" || normalizedExtension === "txt";
    const isEmptyMimeType = !declaredMimeType || declaredMimeType === "application/octet-stream";

    if (!isEmptyMimeType && !allowedMimeTypes.includes(declaredMimeType)) {
        throw new AppError(
            `Falscher Content-Type für .${normalizedExtension}. Erlaubt: ${formatAllowedMimeTypes(allowedMimeTypes)}.`,
            415,
        );
    }

    const detectedMimeType = await detectMimeType(file);
    if (detectedMimeType && !allowedMimeTypes.includes(detectedMimeType)) {
        throw new AppError(
            `Der Dateiinhalt passt nicht zu .${normalizedExtension}. Erkannter Typ: ${detectedMimeType}.`,
            415,
        );
    }

    // For text files with no detected type, allow if declared type is acceptable
    if (!detectedMimeType && isTextBased && isEmptyMimeType) {
        // Text files often have no detectable magic bytes - allow them
        return;
    }

    if (!detectedMimeType && contentDetectionRequired.has(normalizedExtension)) {
        throw new AppError(
            `Der Dateiinhalt konnte nicht als .${normalizedExtension} erkannt werden.`,
            415,
        );
    }
}
