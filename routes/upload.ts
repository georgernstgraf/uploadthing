import { Hono } from "hono";
import { createHash } from "node:crypto";
import config from "../lib/config.ts";
import { getVersionedPath, safeFileComponent, writeAll } from "../lib/pathfuncs.ts";
import * as service from "../service/service.ts";
import * as hbs from "../lib/handlebars.ts";
import { HonoContextVars } from "../lib/types.ts";
import { AppError } from "../lib/errors.ts";
import { UploadSchema } from "../lib/schemas.ts";
import { validateUploadedFileType } from "../lib/upload_filetype.ts";

const uploadRouter = new Hono<{ Variables: HonoContextVars }>();

function formatGermanFileTypes(types: string[]): { label: string; feedback: string } {
    if (types.length === 1) {
        return { label: `.${types[0]}`, feedback: `.${types[0]}` };
    }
    const allButLast = types.slice(0, -1).map((t) => `.${t}`);
    const last = `.${types[types.length - 1]}`;
    return { label: `${allButLast.join(" oder ")} oder ${last}`, feedback: `${allButLast.join(" oder ")} oder ${last}` };
}

uploadRouter.get("/", (c) => {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const types = config.PERMITTED_FILETYPES;
    const germanTypes = formatGermanFileTypes(types);

    const content = hbs.uploadTemplate({
        permitted_types: types,
        accept_attr: types.map((t) => `.${t}`).join(","),
        types_label: germanTypes.label,
        types_feedback: germanTypes.feedback,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
});

uploadRouter.post("/", async (c) => {
    const beginTime = Date.now();
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    const maxUploadBytes = config.MAX_UPLOAD_MB * 1024 * 1024;
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    let formData: FormData;
    try {
        formData = await c.req.formData();
    } catch (e) {
        console.error(`[UPLOAD] FormData parse error from ${remote_ip}: ${(e as Error).message}`);
        throw new AppError(
            `Fehler beim Parsen des Formulars. Bitte versuchen Sie einen anderen Browser (Edge/Firefox) oder laden Sie die Seite neu.`,
            400,
        );
    }

    const validation = UploadSchema.safeParse(formData);

    if (!validation.success) {
        console.error(`[UPLOAD] Schema validation failed from ${remote_ip}:`, validation.error.errors);
        throw new AppError("Keine Datei ausgewählt oder ungültiger Upload", 400);
    }

    const file = validation.data.file as File;

    // Log MIME type for debugging Chrome issues
    console.log(`[UPLOAD] ${remote_user.email} uploading "${file.name}" (${file.size} bytes, type="${file.type}")`);

    if (file.size > maxUploadBytes) {
        throw new AppError(
            `Es sind maximal ${config.MAX_UPLOAD_MB} MB möglich.`,
            413,
        );
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase();
    if (!fileExt || !config.PERMITTED_FILETYPES.includes(fileExt)) {
        const allowed = config.PERMITTED_FILETYPES.map((ext) => `.${ext}`).join(", ");
        throw new AppError(
            `Nur ${allowed} Dateien sind erlaubt.`,
            415,
        );
    }

    try {
        await validateUploadedFileType(file, fileExt);
    } catch (e) {
        console.error(`[UPLOAD] File validation failed for ${file.name}: ${(e as Error).message}`);
        throw e;
    }

    const baseFilename = `${safeFileComponent(remote_user.name)}-${
        safeFileComponent(file.name)
    }`;
    const { filename: real_filename, outPath } = await getVersionedPath(
        config.ABGABEN_DIR,
        baseFilename,
    );

    const hash = createHash("md5");
    let bytesWritten = 0;

    let out: Deno.FsFile | null = null;
    try {
        out = await Deno.open(outPath, {
            create: true,
            write: true,
            truncate: true,
        });

        const reader = file.stream().getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;

            bytesWritten += value.byteLength;
            hash.update(value);
            await writeAll(out, value);
        }
    } catch (e) {
        try {
            if (out) out.close();
        } catch {
            // ignore
        }
        try {
            await Deno.remove(outPath);
        } catch {
            // ignore
        }
        throw new AppError((e as Error).message, 500);
    } finally {
        try {
            out?.close();
        } catch {
            // ignore
        }
    }

    const md5sum = hash.digest("hex");
    const endTime = Date.now();
    const durationSeconds = ((endTime - beginTime) / 1000).toFixed(1);

    if (remote_user.id) {
        await service.abgaben.recordSubmission(
            remote_user.id,
            remote_ip,
            real_filename,
        );
    }

    const content = hbs.successTemplate({
        filename: real_filename,
        filesize: bytesWritten.toString(),
        md5sum,
        duration_seconds: durationSeconds,
        remote_ip,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip,
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
});

export default uploadRouter;
