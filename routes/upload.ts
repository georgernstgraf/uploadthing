import { Hono } from "hono";
import { createHash } from "node:crypto";
import config from "../lib/config.ts";
import { getVersionedPath, safeFileComponent, writeAll } from "../lib/pathfuncs.ts";
import * as service from "../service/service.ts";
import { HonoContextVars } from "../lib/types.ts";
import { AppError } from "../lib/errors.ts";
import { UploadSchema } from "../lib/schemas.ts";
import { validateUploadedFileType } from "../lib/upload_filetype.ts";
import { buildPanel, respondWithStartPage } from "./render.ts";

const uploadRouter = new Hono<{ Variables: HonoContextVars }>();

/**
 * Die Abgabe liegt auf der Startseite (#146). Ein eigener Aufruf von
 * `/upload` würde die Navigation umgehen, die Schüler nicht mehr haben —
 * also zurück auf die eine Seite.
 */
uploadRouter.get("/", (c) => {
    return c.redirect("/");
});

uploadRouter.post("/", async (c) => {
    const beginTime = Date.now();
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    const maxUploadBytes = config.MAX_UPLOAD_MB * 1024 * 1024;
    if (!remote_user) {
        return c.redirect("/");
    }

    if (!(await service.exam.isExamWindowOpen())) {
        throw new AppError("Uploads sind nur während des Examens möglich.", 403);
    }

    let formData: FormData;
    try {
        formData = await c.req.formData();
    } catch (e) {
        console.error(`[UPLOAD] FormData parse error from ${remote_ip}: ${(e as Error).message}`);
        throw new AppError(
            `Fehler beim Parsen des Formulars. Bitte versuche es mit einem anderen Browser (Edge/Firefox) oder lade die Seite neu.`,
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

    if (remote_user.id) {
        if (!service.abgaben.canResubmit(remote_user.id, remote_ip)) {
            throw new AppError(
                "Du hast das WLAN verlassen. Eine erneute Abgabe ist nicht möglich.",
                403,
            );
        }
    }

    const userName = safeFileComponent(remote_user.name);
    const safeFileName = safeFileComponent(file.name);
    const baseFilename = safeFileName.toLowerCase().includes(userName.toLowerCase())
        ? safeFileName
        : `${userName}-${safeFileName}`;

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

    // Das Formular bleibt stehen; der Erfolg kommt als Toast. Die
    // Toast-Nachricht steht als Datenattribut im Panel und wird vom
    // globalen afterSwap-Handler in `templates/index.hbs` angezeigt —
    // ein `HX-Trigger`-Header ginge verloren, weil der auslösende
    // Button beim Swap ersetzt wird.
    const toastMessage = `Abgabe hochgeladen: ${real_filename}`;

    if (c.req.header("HX-Request") === "true") {
        const panel = await buildPanel(c, {
            toast_message: toastMessage,
            toast_type: "success",
        });
        return c.html(panel);
    }

    return await respondWithStartPage(c, {
        success: {
            filename: real_filename,
            filesize: bytesWritten.toString(),
            duration_seconds: durationSeconds,
            md5sum,
        },
    });
});

export default uploadRouter;
