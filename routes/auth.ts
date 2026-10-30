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
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
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

    // Die IP-Sperre für Lehrpersonen (#147): erlaubt ist eine IP aus
    // ADMIN_IPS oder ein Gerät mit freigegebener MAC (Datenbank-Allowlist
    // oder ADMIN_MACS). Die MAC zur IP stammt aus ipfact — dem Polling des
    // MikroTik, nicht aus einem Abruf im Request-Pfad.
    const remoteMac = service.user.isTeacher(user)
        ? service.adminmac.resolveMacForIp(remoteIp)
        : null;

    if (
        !service.adminmac.teacherRegistrationAllowed({
            user,
            ip: remoteIp,
            mac: remoteMac,
        })
    ) {
        throw new AppError(
            "Registrierung als LehrendeR nur von autorisierten IP-Adressen oder MAC-Adressen möglich",
            403,
        );
    }

    await service.user.register(user, remoteIp);

    const session = getSession(c);
    session.login(email);

    c.set("remoteuser", user);
    // Admin ist man ausschließlich über die LDAP-Klasse — eine freigegebene
    // MAC öffnet nur den Login, sie verleiht keine Admin-Rechte.
    const is_admin = service.user.isTeacher(user);
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
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
});

export default authRouter;
