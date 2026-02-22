import { Hono } from "hono";
import config from "./lib/config.ts";
import { sessionMiddleware, remoteIPMiddleware } from "./middleware/session.ts";
import { Bindings, HonoContextVars } from "./lib/types.ts";
import { setupShutdown as setupPrismaShutdown } from "./repo/prismadb.ts";
import { setupShutdown as setupSqliteShutdown } from "./repo/db.ts";

import adminRouter from "./routes/admin.ts";
import homeRouter from "./routes/home.ts";
import uploadRouter from "./routes/upload.ts";
import authRouter from "./routes/auth.ts";
import apiRouter from "./routes/api.ts";
import filesRouter from "./routes/files.ts";

import { errorHandler } from "./middleware/error.ts";

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });

setupPrismaShutdown(); // Setup Prisma graceful shutdown
setupSqliteShutdown(); // Setup SQLite graceful shutdown

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

Deno.serve(
    {
        hostname: config.LISTEN_HOST,
        port: config.LISTEN_PORT,
    },
    (req, info) => app.fetch(req, { info }),
);
