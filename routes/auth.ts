import { Hono } from "hono";
import * as service from "../service/service.ts";
import * as hbs from "../lib/handlebars.ts";
import config from "../lib/config.ts";
import { HonoContextVars } from "../lib/types.ts";
import { LdapSearchSchema, RegisterSchema } from "../lib/schemas.ts";
import { getSession } from "../middleware/session.ts";

import { AppError } from "../lib/errors.ts";

const authRouter = new Hono<{ Variables: HonoContextVars }>();

authRouter.get("/whoami", (c) => {
    const remote_ip = c.get("remoteip");
    const remote_user = c.get("remoteuser");
    const is_admin = c.get("is_admin");

    return c.html(
        hbs.whoamiTemplate({
            remote_ip,
            remote_user,
            is_admin,
            page_title: config.page_title,
        }),
    );
});

authRouter.get("/ldap", async (c) => {
    const query = c.req.query();
    const validation = LdapSearchSchema.safeParse(query);

    if (!validation.success) {
        return c.html(
            hbs.ldapTemplate({
                users: [{ email: "", name: validation.error.format().email?._errors[0] || "Ungültige Eingabe" }],
            }),
        );
    }

    try {
        const users = await service.ldap.searchUserByEmailStart(validation.data.email);
        if (users.length === 0) {
            users.push({
                email: "",
                name: `Keine Email beginnend mit ${validation.data.email} gefunden!`,
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
    // try-catch removed, letting global error handler catch exceptions
    const body = await c.req.parseBody();
    const validation = RegisterSchema.safeParse(body);

    if (!validation.success) {
        throw new AppError(validation.error.format().email?._errors[0] || "Ungültige Eingabe", 400);
    }

    const email = validation.data.email;
    const user = await service.user.getUserByEmail(email);
    if (!user) {
        throw new AppError("User not found", 404);
    }
    const remoteIp = c.get("remoteip");
    await service.user.register(user, remoteIp);

    const session = getSession(c);
    session.login(email);

    return c.redirect("/", 303);
});

export default authRouter;
