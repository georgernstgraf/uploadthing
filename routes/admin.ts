import { Context, Hono } from "hono";
import type { HonoContextVars } from "../lib/types.ts";
import {
    dateTimeString,
    localDateString,
    localTimeString,
    localTimeStringSeconds,
} from "../lib/timefunc.ts";
import * as hbs from "../lib/handlebars.ts";
import { formatEvent, formatTextEvent, openEventStream } from "../lib/sse.ts";
import * as service from "../service/service.ts";
import * as events from "../service/events.ts";
import config, { parsePermittedFileTypes } from "../lib/config.ts";
import { normalizeMac } from "../lib/mac.ts";
import { requireAdmin } from "../middleware/admin.ts";
import {
    buildExamPanelData,
    buildStudentCard,
    buildTikPanelData,
} from "./render.ts";
import type { AdminCardRange } from "./render.ts";
import {
    AdminCleanupDatabaseSchema,
    AdminFileTypesSchema,
    AdminMacDeleteSchema,
    AdminMacSchema,
    AdminQuerySchema,
    AdminThemeSchema,
    AdminUnterlagenDeleteAllSchema,
    AdminUnterlagenDeleteSchema,
    AdminUnterlagenUploadSchema,
} from "../lib/schemas.ts";

const adminRouter = new Hono<{ Variables: HonoContextVars }>();

// Alle /admin-Routen sind admin-pflichtig; die Sperre läuft vor jedem Handler.
adminRouter.use("*", requireAdmin);

const start_ms_earlier = 3.6 * 1.5e6;
const one_day_ms = 24 * 3.6e6;
const time_cutoff_ms = config.TODAY_HOURS_CUTOFF * 3.6e6;

/** Der aufgelöste, geprüfte Zeitraum einer Admin-Forensik-Anfrage (#163). */
type AdminRange = AdminCardRange & {
    startDateTime: Date;
    endDateTime: Date;
};

/**
 * Löst den Zeitraum einer Admin-Anfrage auf — eine Wahrheit für
 * `/admin/students`, `/admin/ip-detail` und `/admin/student-card` (#163).
 *
 * Ohne Angabe gilt `start_ms_earlier`; die Startzeit rastet auf eine
 * Schulstunde aus `spg_times` ein. Ein verdrehter Bereich wird getauscht.
 * Was der Aufrufer daraus ableitet (Cutoff, „endet in der Zukunft"),
 * bleibt seine Sache: dieselbe Spanne bedeutet auf den Panels
 * unterschiedliche Beschriftung.
 */
function parseAdminRange(c: Context<{ Variables: HonoContextVars }>): AdminRange {
    let startdate = c.req.query("startdate") ||
        localDateString(new Date(Date.now() - start_ms_earlier));
    let starttime = c.req.query("starttime");
    if (!starttime) {
        starttime = localTimeString(new Date(Date.now() - start_ms_earlier));
        const times = [...config.spg_times, starttime];
        times.sort();
        const index = times.indexOf(starttime);
        times.splice(index, 1);
        starttime = times.at(index < times.length ? index : -1)!;
    }
    const requestedEndDate = c.req.query("enddate");
    const requestedEndTime = c.req.query("endtime");

    let enddate = requestedEndDate ||
        localDateString(new Date(Date.now() + one_day_ms));
    let endtime = requestedEndTime || starttime;
    let startDateTime = new Date(`${startdate} ${starttime}`);
    let endDateTime = new Date(`${enddate} ${endtime}`);

    if (endDateTime.getTime() < startDateTime.getTime()) {
        [startdate, enddate] = [enddate, startdate];
        [starttime, endtime] = [endtime, starttime];
        [startDateTime, endDateTime] = [endDateTime, startDateTime];
    }

    return {
        startdate,
        starttime,
        enddate,
        endtime,
        startDateTime,
        endDateTime,
    };
}

/**
 * Rendert die Admin-Seite im Erfolgsfall. Fehler laufen **nicht** über
 * diese Funktion, sondern als `c.text(<Meldung>, 4xx)`: der globale
 * Toast-Handler (`templates/index.hbs`) zeigt `responseText` an, und ein
 * komplettes Panel wäre dort ein HTML-Baum statt einer Meldung (#152).
 */
async function renderApplicationPage(
    c: Context<{ Variables: HonoContextVars }>,
    success_message?: string,
    cleanup_result_html?: string,
) {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const content = hbs.adminFileTypesTemplate({
        permitted_filetypes: config.PERMITTED_FILETYPES.join(", "),
        current_filetypes: config.PERMITTED_FILETYPES,
        unterlagen: await service.unterlagen.list(),
        unterlagen_filetypes: config.UNTERLAGEN_PERMITTED_FILETYPES,
        unterlagen_accept: config.UNTERLAGEN_PERMITTED_FILETYPES
            .map((extension) => `.${extension}`)
            .join(","),
        max_upload_mb: config.MAX_UPLOAD_MB,
        allowed_macs: service.adminmac.list().map((entry) => ({
            mac: entry.mac,
            comment: entry.comment,
            created_at: dateTimeString(entry.created_at.toISOString()),
        })),
        env_admin_macs: service.adminmac.envAllowedMacs(),
        exam_panel_html: hbs.adminExamModeTemplate(
            await buildExamPanelData(),
        ),
        available_themes: service.admin.listAvailableThemes(),
        current_theme_key: service.admin.getCurrentThemeKey(),
        success_message,
        cleanup_result_html,
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin: c.get("is_admin"),
        page_title: config.page_title,
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
}

adminRouter.get("/students", async (c) => {
    const is_admin = c.get("is_admin");

    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.redirect("/whoami");
    }

    const query = c.req.query();
    const validation = AdminQuerySchema.safeParse(query);
    if (!validation.success) {
        return c.text("Ungültiges Datums- oder Zeitformat. Bitte verwende YYYY-MM-DD und HH:MM.", 400);
    }

    const range = parseAdminRange(c);
    const { startdate, starttime, enddate, endtime, startDateTime, endDateTime } =
        range;
    const endtimeProvided = Boolean(
        c.req.query("enddate") || c.req.query("endtime"),
    );

    const withinTimeCutoff = Math.abs(
        new Date().getTime() - startDateTime.getTime(),
    ) < time_cutoff_ms;
    const endtimeInFuture = endDateTime.getTime() > new Date().getTime();

    const { registered, unregistered, teacher_ips, anomalies, range_first_seen, range_last_seen } = await service.ipadmin.for_range(
        startDateTime,
        endDateTime,
    );

    const content = hbs.adminTemplate({
        remote_user,
        startdate,
        starttime,
        endtime,
        enddate,
        spg_times: config.spg_times,
        // Kärtchen-Kontext serverseitig (#163): eine Wahrheit für Liste
        // und Fragment-Endpunkt.
        ips_with_name: registered.map((card) => buildStudentCard(card, range)),
        ips_without_name: unregistered.map((card) =>
            buildStudentCard(card, range)
        ),
        teacher_ips: teacher_ips.map((card) => buildStudentCard(card, range)),
        anomalies,
        range_first_seen,
        range_last_seen,
        withinTimeCutoff,
        endtimeInFuture,
        endtimeProvided,
        ...buildTikPanelData(),
    });

    if (c.req.header("HX-Request") === "true") {
        return c.html(content);
    }

    return c.html(hbs.indexTemplate({
        remote_user,
        remote_ip: c.get("remoteip"),
        is_admin,
        page_title: config.page_title,
        hero_url: config.hero_url,
        theme_asset_version: config.THEME_ASSET_VERSION,
        content,
    }));
});

/**
 * Admin-Aktivität als Push (#163).
 *
 * Nur für Lehrpersonen: `requireAdmin` läuft auf `*`, Schüler bekommen
 * 403 und verbinden gar nicht. Der Kanal transportiert **benannte**
 * Komponenten — `event: cards`, `event: card-192-168-21-5`, `event: tik`;
 * die `hx-trigger="sse:…"` der Kärtchen und des Streifens hängen an
 * genau diesen Namen (verdrahtet in Welle 4). Es gibt kein Event-Log;
 * die Koaleszierung entsteht in `service/events.ts`.
 *
 * `stand` trägt reinen Text (Serverzeit). Der Frame kommt beim
 * Verbinden und vor jedem Batch: der Client zeigt damit den Stand, zu dem
 * die Ereignisse gehören, und nicht den des letzten Frames.
 */
adminRouter.get("/events", (c) => {
    return openEventStream(c.req.raw, {
        onOpen: (stream) => {
            const writeStand = () => {
                stream.write(
                    formatTextEvent(
                        "stand",
                        `Stand: ${localTimeStringSeconds()}`,
                    ),
                );
            };

            // Erst abonnieren, dann den ersten Frame schreiben: ein
            // Batch zwischen beiden Schritten kann so nicht verloren
            // gehen.
            const unsubscribe = events.subscribeActivity((components) => {
                writeStand();
                for (const component of components) {
                    // Kein Payload: der Trigger hängt am Ereignisnamen.
                    stream.write(formatEvent(component, null));
                }
            });

            writeStand();

            return unsubscribe;
        },
    });
});

/**
 * Ein einzelnes Kärtchen als Fragment (#163).
 *
 * `null` aus dem Service heißt: die IP hat im Zeitraum weder Sichtung
 * noch Cookie, Registrierung oder Abgabe. Antwort ist dann **204** und
 * nicht 404 — der globale HTMX-Fehler-Toast in `templates/index.hbs`
 * würde sonst bei jedem stillen Kärtchen aufpoppen.
 */
adminRouter.get("/student-card", async (c) => {
    const ip = (c.req.query("ip") ?? "").trim();
    if (!ip) {
        return c.text("Bitte eine IP-Adresse angeben.", 400);
    }

    const validation = AdminQuerySchema.safeParse(c.req.query());
    if (!validation.success) {
        return c.text("Ungültiges Datums- oder Zeitformat. Bitte verwende YYYY-MM-DD und HH:MM.", 400);
    }

    const range = parseAdminRange(c);
    const card = await service.ipadmin.for_ip(
        ip,
        range.startDateTime,
        range.endDateTime,
    );
    if (!card) {
        return c.body(null, 204);
    }

    const data = buildStudentCard(card, range);
    return c.html(
        data.tone === "unbekannt"
            ? hbs.adminStudentCardUnknownTemplate(data)
            : hbs.adminStudentCardTemplate(data),
    );
});

/** Nur der MikroTik-Streifen als Fragment (#163). */
adminRouter.get("/tik-panel", (c) => {
    return c.html(hbs.adminTikPanelTemplate(buildTikPanelData()));
});

adminRouter.get("/ip-detail", async (c) => {
    const ip = c.req.query("ip");
    if (!ip) {
        return c.text("Missing ip parameter", 400);
    }

    const query = c.req.query();
    const validation = AdminQuerySchema.safeParse(query);
    if (!validation.success) {
        return c.text("Ungültiges Datums- oder Zeitformat.", 400);
    }

    // Derselbe Zeitraum wie die Liste (#163): inklusive Einrasten auf
    // `spg_times`. Vorher fehlte das hier — das Detail zeigte einen
    // anderen Ausschnitt als die Karte, aus der es geöffnet wurde.
    const range = parseAdminRange(c);

    try {
        const detail = await service.ipadmin.getIPDetail(
            ip,
            range.startDateTime,
            range.endDateTime,
        );
        return c.html(hbs.adminIPDetailTemplate(detail));
    } catch (error) {
        console.error("ip-detail error:", error);
        return c.text(`Detail konnte nicht geladen werden: ${(error as Error).message}`, 500);
    }
});

adminRouter.get("/application", async (c) => {
    return await renderApplicationPage(c);
});

adminRouter.post("/application", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminFileTypesSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige Dateitypen",
            400,
        );
    }

    const fileTypes = parsePermittedFileTypes(validation.data.permitted_filetypes);
    if (fileTypes.length === 0) {
        return c.text("Mindestens ein Dateityp ist erforderlich", 400);
    }

    config.PERMITTED_FILETYPES = fileTypes;
    return renderApplicationPage(
        c,
        `Erlaubte Dateitypen aktualisiert: ${fileTypes.map((type) => "." + type).join(", ")}`,
    );
});

adminRouter.post("/unterlagen", async (c) => {
    let formData: FormData;
    try {
        formData = await c.req.formData();
    } catch (error) {
        console.error(
            `[UNTERLAGEN] Formular konnte nicht gelesen werden: ${(error as Error).message}`,
        );
        return c.text(
            "Das Formular konnte nicht gelesen werden. Bitte die Seite neu laden und erneut versuchen.",
            400,
        );
    }

    const validation = AdminUnterlagenUploadSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Keine Datei ausgewählt.",
            400,
        );
    }

    // Fehler (Typ, Inhalt, Größe, fehlende Bestätigung) wirft der Service
    // als AppError; der globale Handler antwortet mit der deutschen
    // Meldung und einem non-2xx-Status, den htmx als Toast zeigt.
    const filename = await service.unterlagen.upload(
        validation.data.file,
        // Das Häkchen ist die Bestätigung; ohne es wird nicht ersetzt.
        Boolean(validation.data.replace_existing),
    );
    return await renderApplicationPage(c, `Unterlage gespeichert: ${filename}`);
});

adminRouter.post("/unterlagen/delete", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminUnterlagenDeleteSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Bitte eine Unterlage auswählen.",
            400,
        );
    }

    const filename = await service.unterlagen.remove(validation.data.filename);
    return await renderApplicationPage(c, `Unterlage gelöscht: ${filename}`);
});

adminRouter.post("/unterlagen/delete-all", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminUnterlagenDeleteAllSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message ||
                "Ungültige Anfrage für das Löschen der Unterlagen.",
            400,
        );
    }

    // „Alles löschen“ räumt das flache Verzeichnis; es gibt kein Archiv
    // und keine Versionierung, aus der etwas zurückgeholt werden könnte.
    const removed = await service.unterlagen.removeAll();
    return await renderApplicationPage(
        c,
        removed === 1
            ? "Eine Unterlage wurde gelöscht."
            : `Alle Unterlagen wurden gelöscht (${removed} Dateien).`,
    );
});

adminRouter.post("/adminmac", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminMacSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige MAC-Adresse",
            400,
        );
    }

    try {
        const entry = service.adminmac.add(
            validation.data.mac,
            validation.data.comment,
        );
        return renderApplicationPage(
            c,
            `MAC-Adresse freigegeben: ${entry.mac} (${entry.comment})`,
        );
    } catch (error) {
        // Ungültige Schreibweise oder bereits vorhandene Freigabe: die
        // Meldung nennt den Grund, damit der Fehler sichtbar bleibt.
        return c.text((error as Error).message, 400);
    }
});

adminRouter.post("/adminmac/delete", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminMacDeleteSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige MAC-Adresse",
            400,
        );
    }

    if (!service.adminmac.remove(validation.data.mac)) {
        return c.text(
            `Die MAC-Adresse ${validation.data.mac} war nicht freigegeben.`,
            400,
        );
    }

    return renderApplicationPage(
        c,
        `MAC-Freigabe entfernt: ${
            normalizeMac(validation.data.mac) ?? validation.data.mac
        }`,
    );
});

adminRouter.post("/theme", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminThemeSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültiges Theme",
            400,
        );
    }

    try {
        const theme = service.admin.applyTheme(validation.data.theme);
        return renderApplicationPage(c, `Theme aktiviert: ${theme.label}`);
    } catch (error) {
        console.error(
            `[ADMIN] Theme konnte nicht aktiviert werden: ${(error as Error).message}`,
        );
        return c.text(
            `Theme konnte nicht aktiviert werden: ${(error as Error).message}`,
            500,
        );
    }
});

adminRouter.get("/download-abgaben", (c) => {
    const vacuumPath = `${config.ABGABEN_DIR}/vacuum.db`;
    
    try {
        service.admin.createDatabaseBackup(vacuumPath);
    } catch (e) {
        console.error("Error creating database backup:", e);
        return c.text("Failed to create database backup.", 500);
    }

    const cmd = new Deno.Command("tar", {
        args: ["-czf", "-", "."],
        cwd: config.ABGABEN_DIR,
        stdout: "piped",
    });

    const child = cmd.spawn();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T").join("_").slice(0, 16);
    const filename = `abgaben_${timestamp}.tar.gz`;

    c.header("Content-Type", "application/gzip");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return c.body(child.stdout);
});

adminRouter.post("/wipe-abgaben", (c) => {
    try {
        service.admin.wipeAbgabenDirectory(config.ABGABEN_DIR);
        return c.html(`<div class="alert alert-success fs-lg mt-2 mx-auto" style="max-width: 800px;">Abgaben-Verzeichnis erfolgreich geleert.</div>`);
    } catch (e) {
        console.error("Error wiping abgaben directory:", e);
        return c.html(`<div class="alert alert-danger fs-lg mt-2 mx-auto" style="max-width: 800px;">Fehler beim Leeren des Abgaben-Verzeichnisses.</div>`, 500);
    }
});

adminRouter.post("/cleanup-database", async (c) => {
    const formData = await c.req.formData();
    const validation = AdminCleanupDatabaseSchema.safeParse(formData);
    if (!validation.success) {
        return c.text("Ungültige Anfrage für die Datenbankbereinigung", 400);
    }

    try {
        const result = service.admin.cleanupDatabaseOlderThanOneYear();
        const html = `<div id="cleanup-result" class="alert alert-success fs-lg mt-2 mx-auto" style="max-width: 720px;">Datenbank bereinigt. Entfernt: ${result.deleted_cookiepresents} Cookies, ${result.deleted_registrations} Registrierungen, ${result.deleted_ipfacts} IP-Logs, ${result.deleted_tikscans} Scans, ${result.deleted_submissions} Abgaben (gesamt ${result.total_deleted}).</div>`;
        return renderApplicationPage(c, undefined, html);
    } catch (error) {
        console.error("Error cleaning up database:", error);
        return c.text("Fehler bei der Datenbankbereinigung", 500);
    }
});

export default adminRouter;
