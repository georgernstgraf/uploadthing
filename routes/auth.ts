import { Hono } from "hono";
import * as service from "../service/service.ts";
import * as hbs from "../lib/handlebars.ts";
import config from "../lib/config.ts";
import { HonoContextVars } from "../lib/types.ts";
import { LdapSearchSchema, RegisterSchema } from "../lib/schemas.ts";
import { getSession } from "../middleware/session.ts";
import { get_unterlagen } from "../lib/pathfuncs.ts";

import { AppError } from "../lib/errors.ts";

const authRouter = new Hono<{ Variables: HonoContextVars }>();

authRouter.get("/whoami", (c) => {
    const content = hbs.whoamiTemplate({
        remote_user: c.get("remoteuser"),
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user: c.get("remoteuser"),
        remote_ip: c.get("remoteip"),
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        content,
    }));
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

    if (
        user.klasse === "LehrendeR" &&
        config.ADMIN_IPS.length > 0 &&
        !config.ADMIN_IPS.includes(remoteIp)
    ) {
        throw new AppError(
            "Registrierung als LehrendeR nur von autorisierten IP-Adressen möglich",
            403,
        );
    }

    await service.user.register(user, remoteIp);

    const session = getSession(c);
    session.login(email);

    c.set("remoteuser", user);
    const is_admin = user.klasse === "LehrendeR";
    c.set("is_admin", is_admin);

    const files = await get_unterlagen();
    const content = hbs.dirIndexTemplate({
        unterlagen_dir: config.UNTERLAGEN_DIR,
        files,
    });

    return c.html(hbs.mainTemplate({
        remote_user: user,
        remote_ip: remoteIp,
        is_admin,
        page_title: config.page_title,
        content,
    }));
});

export default authRouter;
