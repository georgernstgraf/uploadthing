import { Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import config from "../lib/config.ts";
import * as hbs from "../lib/handlebars.ts";
import { buildPanel, buildStartContent } from "./render.ts";

const homeRouter = new Hono<{ Variables: HonoContextVars }>();

/**
 * Eine Seite (#146): links Angaben und Doku-Links, rechts Anmeldung bzw.
 * Abgabe. HTMX-Anfragen (Navigation) bekommen nur den Inhalt.
 */
homeRouter.get("/", async (c) => {
    const content = await buildStartContent(c);

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
 * Nur die rechte Spalte (Anmeldung bzw. Abgabe) als Fragment.
 *
 * Das Abgabe-Panel entsteht einmal beim Seitenaufbau; startet die
 * Lehrperson danach das Examen, muss es ohne Reload nachziehen können
 * (#160). Deshalb dieser Endpunkt statt `GET /` mit `hx-select`:
 * `buildStartContent` würde bei jedem Aufruf zusätzlich die Unterlagen
 * einlesen und die ganze Seite rendern — hier genügt ein SQLite-Read.
 */
homeRouter.get("/abgabe-panel", async (c) => {
    return c.html(await buildPanel(c));
});

export default homeRouter;
