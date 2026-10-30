import { Hono } from "hono";
import config from "./lib/config.ts";
import { sessionMiddleware, remoteIPMiddleware } from "./middleware/session.ts";
import { Bindings, HonoContextVars } from "./lib/types.ts";
import { shutdownSqlite } from "./repo/db.ts";
import * as service from "./service/service.ts";

import adminRouter from "./routes/admin.ts";
import homeRouter from "./routes/home.ts";
import uploadRouter from "./routes/upload.ts";
import authRouter from "./routes/auth.ts";
import apiRouter from "./routes/api.ts";
import filesRouter from "./routes/files.ts";

import { errorHandler } from "./middleware/error.ts";

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });
// ... und das Verzeichnis für die Unterlagen (#134): der Admin-Upload
// schreibt dorthin, ohne selbst Verzeichnisse anzulegen.
await Deno.mkdir(config.UNTERLAGEN_DIR, { recursive: true });

const app = new Hono<{ Bindings: Bindings; Variables: HonoContextVars }>();
app.onError(errorHandler);
app.use("*", sessionMiddleware);
app.use("*", remoteIPMiddleware);

// Mount routers
app.route("/admin", adminRouter);
app.route("/upload", uploadRouter);
app.route("/", homeRouter);
app.route("/", authRouter);
app.route("/api", apiRouter);
app.route("/", filesRouter);

const abortController = new AbortController();
let shuttingDown = false;
let tikPoller: ReturnType<typeof service.tik.startPolling> = null;

const shutdown = async (signal: Deno.Signal) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    console.log(`Received ${signal}, shutting down HTTP server...`);

    // Zuerst das Tik-Polling stoppen: ein laufender Abruf schreibt in
    // die Datenbank und darf das SQLite-Handle nicht überleben.
    await tikPoller?.stop();
    abortController.abort();

    shutdownSqlite(signal);

    Deno.removeSignalListener("SIGINT", sigintHandler);
    Deno.removeSignalListener("SIGTERM", sigtermHandler);
};

const sigintHandler = () => {
    void shutdown("SIGINT");
};

const sigtermHandler = () => {
    void shutdown("SIGTERM");
};

Deno.addSignalListener("SIGINT", sigintHandler);
Deno.addSignalListener("SIGTERM", sigtermHandler);

await service.admin.runExamModeOnStartup();

// Aktive IPs und MACs direkt aus dem MikroTik: Sofortabruf, dann alle 60 s.
tikPoller = service.tik.startPolling();

await Deno.serve(
    {
        hostname: config.LISTEN_HOST,
        port: config.LISTEN_PORT,
        signal: abortController.signal,
        ...(config.TLS
            ? {
                cert: Deno.readTextFileSync(config.TLS.certPath),
                key: Deno.readTextFileSync(config.TLS.keyPath),
            }
            : {}),
    },
    (req, info) => app.fetch(req, { info }),
);
