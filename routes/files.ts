import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import config from "../lib/config.ts";
import { HonoContextVars } from "../lib/types.ts";

const filesRouter = new Hono<{ Variables: HonoContextVars }>();

filesRouter.get(
    "static/*",
    serveStatic({
        root: "./static",
        rewriteRequestPath: (path) => path.replace(/^\/static/, "/"),
    }),
);

filesRouter.get(
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

export default filesRouter;
