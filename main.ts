import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { createHash } from "node:crypto";
import config from "./lib/config.ts";
import { get_unterlagen, getVersionedPath } from "./lib/lib.ts";
import { remoteIPMiddleware } from "./middleware/remoteip.ts";
import * as service from "./service/service.ts";
import * as hbs from "./lib/handlebars.ts";
import { Bindings, Variables } from "./lib/types.ts";
import forensicRouter from "./routes/forensic.ts";
import { setupShutdown } from "./repo/prismadb.ts";

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });

setupShutdown(); // Setup Prisma graceful shutdown

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", remoteIPMiddleware);

// Mount forensic router
app.route("/forensic", forensicRouter);

app.get("/", async (c) => {
    const files = await get_unterlagen();
    return c.html(hbs.dirIndexTemplate({
        unterlagen_dir: config.UNTERLAGEN_DIR,
        files,
        remote_user: c.get("remoteuser"),
        remote_ip: c.get("remoteip"),
        page_title: config.page_title,
    }));
});
app.get(
    "static/*",
    serveStatic({
        root: "./static",
        rewriteRequestPath: (path) => path.replace(/^\/static/, "/"),
    }),
);
// 1. Directory Index Handler
app.get("upload", (c) => {
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
app.post("upload", async (c) => {
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

app.get("whoami", (c) => {
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    return c.html(
        hbs.whoamiTemplate({
            remote_ip,
            remote_user,
            page_title: config.page_title,
        }),
    );
});
app.get("ldap", async (c) => {
    const query = c.req.query();
    try {
        const users = await service.ldap.searchUserByEmailStart(query.email);
        if (users.length === 0) {
            users.push({
                email: "",
                name: `Keine Email beginnend mit ${query.email} gefunden!`,
                klasse: "",
            });
        }
        return c.html(hbs.ldapTemplate({ users }));
    } catch (_e) {
        return c.html(
            hbs.ldapTemplate({
                users: [{ email: "", name: "mindestens 3 Anfangsbuchstaben!" }],
            }),
        );
    }
});
app.post("register", async (c) => {
    try {
        const body = await c.req.parseBody();
        const email = body.email as string;
        const ldapuser = await service.ldap.getUserByEmail(email);
        if (!ldapuser) {
            return c.text("User not found", 404);
        }
        const remoteIp = c.get("remoteip");
        await service.user.register(ldapuser, remoteIp);
        return c.redirect("/");
    } catch (e) {
        return c.text((e as Error).message, 400);
    }
});
//  I get a filename per json
app.post("activeips", async (c) => {
    try {
        const body = await c.req.json();
        const ips = body.ips as string[];
        const count = service.ipfact.registerips(ips);
        return c.json({ "ok": "true", count });
    } catch (e) {
        return c.json({ "ok": "false", "message": (e as Error).message }, 400);
    }
});
app.get(
    "unterlagen/*",
    async (c, next) => {
        const remote_user = c.get("remoteuser");
        if (!remote_user) {
            return c.redirect("/whoami");
        }
        const handler = serveStatic({
            root: config.UNTERLAGEN_DIR,
            rewriteRequestPath: (path) => path.replace(/^\/unterlagen/, "/"),
        });
        return await handler(c, next);
    },
);

Deno.serve(
    {
        hostname: config.LISTEN_HOST,
        port: config.LISTEN_PORT,
    },
    (req, info) => app.fetch(req, { info }),
);

function safeFileComponent(input: string): string {
    // prevent path traversal + weird separators; keep it simple
    return input
        .replace(/[\/\\]/g, "_")
        .replace(/\.\./g, "_")
        .replace(/\s+/g, "_");
}

async function writeAll(f: Deno.FsFile, chunk: Uint8Array): Promise<void> {
    let off = 0;
    while (off < chunk.length) {
        const n = await f.write(chunk.subarray(off));
        if (n <= 0) throw new Error("short write");
        off += n;
    }
}
