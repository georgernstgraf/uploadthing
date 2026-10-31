import { Hono } from "hono";
import config from "./lib/config.ts";
import { sessionMiddleware, remoteIPMiddleware } from "./middleware/session.ts";
import { Bindings, HonoContextVars } from "./lib/types.ts";
import { shutdownSqlite } from "./repo/db.ts";
import { createShutdown } from "./lib/shutdown.ts";
import * as service from "./service/service.ts";

import adminRouter from "./routes/admin.ts";
import homeRouter from "./routes/home.ts";
import uploadRouter from "./routes/upload.ts";
import authRouter from "./routes/auth.ts";
import apiRouter from "./routes/api.ts";
import filesRouter from "./routes/files.ts";

import { errorHandler } from "./middleware/error.ts";
import { securityHeaders } from "./middleware/security_headers.ts";

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });
// ... und das Verzeichnis für die Unterlagen (#134): der Admin-Upload
// schreibt dorthin, ohne selbst Verzeichnisse anzulegen.
await Deno.mkdir(config.UNTERLAGEN_DIR, { recursive: true });

const app = new Hono<{ Bindings: Bindings; Variables: HonoContextVars }>();
app.onError(errorHandler);
// Vor der Session-Middleware, damit auch Ablehnungen und Fehler die
// Security-Header tragen.
app.use("*", securityHeaders);
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
let tikPoller: ReturnType<typeof service.tik.startPolling> = null;
let server: Deno.HttpServer | null = null;

// Reihenfolge und Notbremse stehen in lib/shutdown.ts (#156): erst das
// Polling stoppen, dann den Server auslaufen lassen, dann SQLite
// schließen, dann den Prozess beenden. Vorher blieb der Prozess nach
// SIGTERM hängen und systemd musste ihn nach 20 s hart killen.
const shutdown = createShutdown({
    stopBackgroundWork: async () => {
        // Ein laufender Abruf schreibt in die Datenbank und darf das
        // SQLite-Handle nicht überleben.
        await tikPoller?.stop();
    },
    drainServer: async () => {
        abortController.abort();
        await server?.finished;
    },
    closeDatabase: (signal) => {
        shutdownSqlite(signal);
    },
    exit: (code) => Deno.exit(code),
});

Deno.addSignalListener("SIGINT", () => {
    void shutdown("SIGINT");
});
Deno.addSignalListener("SIGTERM", () => {
    void shutdown("SIGTERM");
});

await service.admin.runExamModeOnStartup();

// Aktive IPs und MACs direkt aus dem MikroTik: Sofortabruf, dann alle 60 s.
tikPoller = service.tik.startPolling();

server = Deno.serve(
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

// Der Server läuft, bis ein Signal kommt; `finished` löst nach dem Abort
// auf. Der eigentliche Exit passiert im Shutdown-Handler.
await server.finished;
