import { Hono } from "hono";
import config from "./lib/config.ts";
import { sessionMiddleware, remoteIPMiddleware } from "./middleware/session.ts";
import { Bindings, HonoContextVars } from "./lib/types.ts";
import { shutdownPrisma } from "./repo/prismadb.ts";
import { shutdownSqlite } from "./repo/db.ts";

import adminRouter from "./routes/admin.ts";
import homeRouter from "./routes/home.ts";
import uploadRouter from "./routes/upload.ts";
import authRouter from "./routes/auth.ts";
import apiRouter from "./routes/api.ts";
import filesRouter from "./routes/files.ts";

import { errorHandler } from "./middleware/error.ts";

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });

const app = new Hono<{ Bindings: Bindings; Variables: HonoContextVars }>();
app.onError(errorHandler);
app.use("*", sessionMiddleware);
app.use("*", remoteIPMiddleware);

// Mount routers
app.route("/admin", adminRouter);
app.route("/upload", uploadRouter);
app.route("/", homeRouter);
app.route("/", authRouter);
app.route("/", apiRouter);
app.route("/", filesRouter);

const abortController = new AbortController();
let shuttingDown = false;

const shutdown = async (signal: Deno.Signal) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    console.log(`Received ${signal}, shutting down HTTP server...`);
    abortController.abort();

    await shutdownPrisma(signal);
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

await Deno.serve(
    {
        hostname: config.LISTEN_HOST,
        port: config.LISTEN_PORT,
        signal: abortController.signal,
    },
    (req, info) => app.fetch(req, { info }),
);
