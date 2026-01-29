import { Hono } from "hono";
import { createHash } from "node:crypto";
import config from "../lib/config.ts";
import { getVersionedPath, safeFileComponent, writeAll } from "../lib/pathfuncs.ts";
import * as service from "../service/service.ts";
import * as hbs from "../lib/handlebars.ts";
import { HonoContextVars } from "../lib/types.ts";

const uploadRouter = new Hono<{ Variables: HonoContextVars }>();

uploadRouter.get("/", (c) => {
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    return c.html(
        hbs.uploadTemplate({
            remote_ip,
            remote_user,
            page_title: config.page_title,
        }),
    );
});

uploadRouter.post("/", async (c) => {
    const beginTime = Date.now();
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    const maxUploadBytes = config.MAX_UPLOAD_MB * 1024 * 1024;
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) return c.text("No file uploaded", 400);
    if (file.size > maxUploadBytes) {
        return c.text(
            `Es sind maximal ${config.MAX_UPLOAD_MB} MB möglich.`,
            413,
        );
    }

    const baseFilename = `${safeFileComponent(remote_user.name)}-${
        safeFileComponent(remote_ip)
    }-${safeFileComponent(file.name)}`;
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

            // value is a Uint8Array chunk
            bytesWritten += value.byteLength;
            hash.update(value);
            await writeAll(out, value);
        }
    } catch (e) {
        // best-effort cleanup of partial file
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
        return c.text((e as Error).message, 500);
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

    return c.html(
        hbs.successTemplate({
            remote_ip,
            filename: real_filename,
            filesize: bytesWritten.toString(),
            md5sum,
            duration_seconds: durationSeconds,
            remote_user,
            page_title: config.page_title,
        }),
    );
});

export default uploadRouter;
