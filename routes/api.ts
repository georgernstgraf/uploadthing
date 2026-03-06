import { Hono } from "hono";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import { HonoContextVars } from "../lib/types.ts";
import { ActiveIpsSchema, AdminExamModeSchema } from "../lib/schemas.ts";

const apiRouter = new Hono<{ Variables: HonoContextVars }>();

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

apiRouter.post("/exammode", async (c) => {
    const is_admin = c.get("is_admin");
    if (!is_admin) {
        return c.text("Forbidden", 403);
    }

    const formData = await c.req.formData();
    const validation = AdminExamModeSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige Firewall-Einstellung",
            400,
        );
    }

    const internet_active = validation.data.internet_active === "on";

    try {
        const result = await service.admin.setInternetActive(internet_active);
        if (!result.ok) {
            const details = [result.stderr, result.stdout].filter(Boolean).join(" | ");
            console.error("exammode failed:", result);
            return c.text(
                `exammode fehlgeschlagen (Exit ${result.code})${details ? `: ${details}` : ""}`,
                500,
            );
        }

        return c.html(hbs.adminExamModeTemplate({
            internet_active: result.internet_active,
        }));
    } catch (error) {
        console.error("exammode could not be executed:", error);
        return c.text(`exammode konnte nicht ausgeführt werden: ${(error as Error).message}`, 500);
    }
});

export default apiRouter;
