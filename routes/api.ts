import { Hono } from "hono";
import * as service from "../service/service.ts";
import { ActiveIpsSchema } from "../lib/schemas.ts";

const apiRouter = new Hono();

apiRouter.post("/activeips", async (c) => {
    try {
        const body = await c.req.json();
        const validation = ActiveIpsSchema.safeParse(body);
        
        if (!validation.success) {
             return c.json({ "ok": "false", "message": validation.error.message }, 400);
        }

        const ips = validation.data.ips;
        const count = service.ipfact.registerips(ips);
        return c.json({ "ok": "true", count });
    } catch (e) {
        return c.json({ "ok": "false", "message": (e as Error).message }, 400);
    }
});

export default apiRouter;
