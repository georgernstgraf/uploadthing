import { Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import config from "../lib/config.ts";
import { get_unterlagen } from "../lib/pathfuncs.ts";
import * as hbs from "../lib/handlebars.ts";

const homeRouter = new Hono<{ Variables: HonoContextVars }>();

homeRouter.get("/", async (c) => {
    const files = await get_unterlagen();
    return c.html(hbs.dirIndexTemplate({
        unterlagen_dir: config.UNTERLAGEN_DIR,
        files,
        remote_user: c.get("remoteuser"),
        remote_ip: c.get("remoteip"),
        page_title: config.page_title,
    }));
});

export default homeRouter;
