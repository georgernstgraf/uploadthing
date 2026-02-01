import { Hono } from "hono";
import config from "./lib/config.ts";
import { remoteIPMiddleware } from "./middleware/remoteip.ts";
import { Bindings, HonoContextVars } from "./lib/types.ts";
import { setupShutdown as setupSqliteShutdown } from "./repo/db.ts";
import { initDatabase } from "./repo/init_db.ts";

// Initialize database schema FIRST before any repo modules load
initDatabase();

// Now it's safe to import repo modules
const { default: forensicRouter } = await import("./routes/forensic.ts");
const { default: homeRouter } = await import("./routes/home.ts");
const { default: uploadRouter } = await import("./routes/upload.ts");
const { default: authRouter } = await import("./routes/auth.ts");
const { default: apiRouter } = await import("./routes/api.ts");
const { default: filesRouter } = await import("./routes/files.ts");
const { errorHandler } = await import("./middleware/error.ts");

// ensure ABGABEN_DIR exists
await Deno.mkdir(config.ABGABEN_DIR, { recursive: true });

setupSqliteShutdown(); // Setup SQLite graceful shutdown

const app = new Hono<{ Bindings: Bindings; Variables: HonoContextVars }>();
app.onError(errorHandler);
app.use("*", remoteIPMiddleware);

// Mount routers
app.route("/forensic", forensicRouter);
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
