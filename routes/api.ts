import { Hono } from "hono";
import * as service from "../service/service.ts";

const apiRouter = new Hono();

apiRouter.post("/activeips", async (c) => {
    try {
        const body = await c.req.json();
        const ips = body.ips as string[];
        const count = service.ipfact.registerips(ips);
        return c.json({ "ok": "true", count });
    } catch (e) {
        return c.json({ "ok": "false", "message": (e as Error).message }, 400);
    }
});

export default apiRouter;
