import { Hono } from "hono";
import * as service from "../service/service.ts";
import * as hbs from "../lib/handlebars.ts";
import config from "../lib/config.ts";
import { HonoContextVars } from "../lib/types.ts";
import { LdapSearchSchema, RegisterSchema } from "../lib/schemas.ts";
import { getSession } from "../middleware/session.ts";
import { respondWithStartPage } from "./render.ts";

const authRouter = new Hono<{ Variables: HonoContextVars }>();

/**
 * Anmeldung / Name ändern. Die eigentliche Anmeldung liegt auf der
 * Startseite (#146); diese Seite bleibt für Lehrpersonen, die den Namen
 * wechseln wollen.
 */
authRouter.get("/whoami", (c) => {
    const content = hbs.whoamiTemplate({
        remote_user: c.get("remoteuser"),
        login_panel_html: hbs.loginPanelTemplate({
            title: "Anmelden / Name ändern",
        }),
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

/**
 * Namenssuche für die Anmeldung (#146): ein Feld, Treffer ab drei
 * Zeichen, Anzeige „Vorname Nachname · Klasse" ohne E-Mail.
 * Es wird hier **nichts** registriert — das passiert erst beim Klick.
 */
authRouter.get("/ldap", async (c) => {
    const validation = LdapSearchSchema.safeParse(c.req.query());

    if (!validation.success) {
        return c.html(hbs.ldapTemplate({
            users: [],
            error: validation.error.issues[0]?.message ||
                "Ungültiger Suchbegriff.",
        }));
    }

    try {
        const result = await service.ldap.searchLoginCandidates(
            validation.data.q,
        );
        return c.html(hbs.ldapTemplate({
            users: result.users,
            empty: result.users.length === 0,
            has_more: result.has_more,
        }));
    } catch (e) {
        console.error("LDAP-Suche fehlgeschlagen:", (e as Error).message);
        return c.html(hbs.ldapTemplate({
            users: [],
            error: service.ldap.searchFailureMessage(e),
        }));
    }
});

/**
 * Registriert die angeklickte Person und meldet sie an.
 *
 * Alle Fehlerfälle (unbekannte Person, LDAP weg, Anmeldesperre im
 * Examen) werden in derselben rechten Spalte angezeigt — deshalb immer
 * die Startseite als Antwort, auch bei Ablehnung.
 */
authRouter.post("/register", async (c) => {
    const body = await c.req.parseBody();
    const validation = RegisterSchema.safeParse(body);

    if (!validation.success) {
        return await respondWithStartPage(c, {
            login_error: validation.error.issues[0]?.message ||
                "Ungültige Eingabe.",
        });
    }

    const email = validation.data.email;
    const user = await service.ldap.resolveLoginUser(email);

    if (!user) {
        return await respondWithStartPage(c, {
            login_error:
                "Zu dieser Person gibt es kein Benutzerkonto. Bitte suche deinen Namen erneut.",
        });
    }

    // Anmeldesperre im Examen (#146): Ein Namenswechsel mitten in der
    // Prüfung wäre ein Prüfungsunfall. Lehrpersonen sind ausgenommen,
    // sonst käme der Lehrer nach Sessionverlust nicht mehr hinein. Die
    // Klasse ist erst hier bekannt, deshalb wird nach dem Lookup
    // entschieden — die Mail-Endung sagt nichts über die Rolle.
    if (!service.user.isTeacher(user)) {
        if (!(await service.exam.isStudentRegistrationOpen())) {
            return await respondWithStartPage(c, {
                login_error:
                    "Während der Prüfung ist keine Neuanmeldung möglich. Bitte wende dich an deine Lehrperson.",
            });
        }
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
        return await respondWithStartPage(c, {
            login_error:
                "Anmeldung als LehrendeR ist nur von autorisierten Geräten möglich.",
        });
    }

    await service.user.register(user, remoteIp);

    const session = getSession(c);
    session.login(email);

    c.set("remoteuser", user);
    // Admin ist man ausschließlich über die LDAP-Klasse — eine freigegebene
    // MAC öffnet nur den Login, sie verleiht keine Admin-Rechte.
    c.set("is_admin", service.user.isTeacher(user));

    return await respondWithStartPage(c);
});

export default authRouter;
