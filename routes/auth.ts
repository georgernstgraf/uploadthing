import { Hono } from "hono";
import * as service from "../service/service.ts";
import * as hbs from "../lib/handlebars.ts";
import config from "../lib/config.ts";
import { HonoContextVars } from "../lib/types.ts";

const authRouter = new Hono<{ Variables: HonoContextVars }>();

authRouter.get("/whoami", (c) => {
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    return c.html(
        hbs.whoamiTemplate({
            remote_ip,
            remote_user,
            page_title: config.page_title,
        }),
    );
});

authRouter.get("/ldap", async (c) => {
    const query = c.req.query();
    try {
        const users = await service.ldap.searchUserByEmailStart(query.email);
        if (users.length === 0) {
            users.push({
                email: "",
                name: `Keine Email beginnend mit ${query.email} gefunden!`,
            });
        }
        return c.html(hbs.ldapTemplate({ users }));
    } catch (_e) {
        return c.html(
            hbs.ldapTemplate({
                users: [{ email: "", name: "mindestens 3 Anfangsbuchstaben!" }],
            }),
        );
    }
});

authRouter.post("/register", async (c) => {
    try {
        const body = await c.req.parseBody();
        const email = body.email as string;
        const user = await service.user.getUserByEmail(email);
        if (!user) {
            return c.text("User not found", 404);
        }
        const remoteIp = c.get("remoteip");
        await service.user.register(user, remoteIp);
        return c.redirect("/", 303);
    } catch (e) {
        return c.text((e as Error).message, 400);
    }
});

export default authRouter;
