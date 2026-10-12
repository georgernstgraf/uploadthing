import { Hono } from "hono";
import * as service from "../service/service.ts";
import { HonoContextVars } from "../lib/types.ts";
import { ActiveIpsSchema } from "../lib/schemas.ts";
import config from "../lib/config.ts";

/**
 * Maschinen-Router für die WLAN-Infrastruktur.
 *
 * Wird in `main.ts` am Root gemountet (nicht unter `/api`), weil
 * `POST /activeips` ein externer Vertrag mit dem WLAN-Device ist und
 * sich die IP-Whitelist (`ACTIVEIPS_ALLOWED_IPS`) vom Admin-/API-Bereich
 * unabhängig bleibt.
 */
const machineRouter = new Hono<{ Variables: HonoContextVars }>();

machineRouter.post("/activeips", async (c) => {
    try {
        const remoteIp = c.get("remoteip");
        if (!config.ACTIVEIPS_ALLOWED_IPS.includes(remoteIp)) {
            return c.json({ "ok": "false", "message": "Forbidden" }, 403);
        }

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

export default machineRouter;
