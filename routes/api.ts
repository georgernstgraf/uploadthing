import { Context, Hono } from "hono";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import { HonoContextVars } from "../lib/types.ts";
import { getSession } from "../middleware/session.ts";
import { requireAdmin } from "../middleware/admin.ts";
import {
    AdminExamExtraSchema,
    AdminExamModeSchema,
    AdminExamStartSchema,
    AdminRegistrationWindowSchema,
} from "../lib/schemas.ts";
import { buildRegistrationWindowPanel } from "./render.ts";

/**
 * API-Router — wird in `main.ts` ausschließlich unter `/api` gemountet.
 */
const apiRouter = new Hono<{ Variables: HonoContextVars }>();

/**
 * Rendert das Admin-Exam-Panel (Examen-Steuerung + Firewall-Regel)
 * als HTMX-Antwort: Bei erfolgreichen Aktionen wird der Ziel-Container
 * mit dem aktuellen Panel ersetzt.
 *
 * Der Firewall-Zustand wird bei jedem Rendern frisch von der
 * OPNsense-API gelesen (kein Polling, keine geratene Kopie im
 * Speicher). Ist er nicht abrufbar, rendert das Panel den Zustand
 * „unbekannt" samt Modal; ein Fehler aus der auslösenden Aktion wird
 * zusätzlich als `firewall_error` mitgegeben, damit das Modal den
 * tatsächlichen API-Fehler nennt.
 */
async function renderExamPanel(
    c: Context<{ Variables: HonoContextVars }>,
    options: { success_message?: string; firewall_error?: string } = {},
) {
    const exam = await service.exam.getStatusView();
    const firewall = service.admin.buildExamFirewallPanel(
        await service.admin.getExamModeStatus(),
        options.firewall_error,
    );

    return c.html(hbs.adminExamModeTemplate({
        exam_status: exam.status,
        exam_remaining_label: exam.remaining_label,
        exam_open: exam.open,
        exam_running: exam.status === "running" || exam.status === "paused",
        firewall_state: firewall.firewall_state,
        firewall_error: firewall.firewall_error,
        firewall_modal: firewall.firewall_modal,
        success_message: options.success_message,
    }));
}

apiRouter.get("/exammode", requireAdmin, async (c) => {
    return await renderExamPanel(c);
});

apiRouter.post("/exammode", requireAdmin, async (c) => {
    const formData = await c.req.formData();
    const validation = AdminExamModeSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige Firewall-Einstellung",
            400,
        );
    }

    if (!service.admin.isExamModeConfigured()) {
        return c.text(
            "Die Exam-Sperre ist nicht konfiguriert (OPNSENSE_API_KEY und OPNSENSE_API_SECRET fehlen).",
            400,
        );
    }

    const internet_active = validation.data.internet_active === "on";
    const result = await service.admin.setInternetActive(internet_active);

    if (!result.ok) {
        console.error("Exam-Sperre konnte nicht geschaltet werden:", result.stderr);
    }

    return await renderExamPanel(c, {
        success_message: result.ok
            ? (internet_active
                ? "Internetzugang ist freigegeben."
                : "Internetzugang ist gesperrt.")
            : undefined,
        firewall_error: result.ok ? undefined : result.stderr,
    });
});

/**
 * Startet ein Examen mit vorgegebener Dauer (Formularfeld `minutes`,
 * Ganzzahl in Minuten, 1–600) und schaltet die Exam-Sperre implizit
 * scharf. Ungültige Übergänge der State-Machine (z. B. Start während
 * eines laufenden Examens) werden mit 409 und deutscher Fehlermeldung
 * gemeldet.
 *
 * Das Examen startet auch dann, wenn die Sperre scheitert; das Panel
 * zeigt dann „Examen läuft · Internet frei" samt Modal mit dem
 * API-Fehler. Deshalb ist die Antwort in beiden Fällen das Panel.
 */
apiRouter.post("/exam/start", requireAdmin, async (c) => {
    const formData = await c.req.formData();
    const validation = AdminExamStartSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige Prüfungsdauer",
            400,
        );
    }

    try {
        const result = await service.exam.start(validation.data.minutes * 60);
        // Das Examen läuft in jedem Fall — der Start ist bestätigt. Ein
        // gescheitertes Sperren landet als API-Fehler im Warnband und im
        // Modal, nicht als verschluckter Erfolg.
        return await renderExamPanel(c, {
            success_message:
                `Examen gestartet. Dauer: ${validation.data.minutes} Minuten.`,
            firewall_error: result.ok ? undefined : result.stderr,
        });
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

apiRouter.post("/exam/pause", requireAdmin, async (c) => {
    try {
        service.exam.pause();
        return await renderExamPanel(c, { success_message: "Examen pausiert." });
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

apiRouter.post("/exam/resume", requireAdmin, async (c) => {
    try {
        service.exam.resume();
        return await renderExamPanel(c, { success_message: "Examen fortgesetzt." });
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

/**
 * Stoppt das Examen vorzeitig und löst die Exam-Sperre (Internet
 * wieder frei). Schlägt der API-Aufruf fehl, bleibt der Exam-Zustand
 * auf stopped; das Panel zeigt den echten Firewall-Zustand und das
 * Modal nennt den Fehler.
 */
apiRouter.post("/exam/stop", requireAdmin, async (c) => {
    try {
        const result = await service.exam.stop();
        return await renderExamPanel(c, {
            success_message: result.ok
                ? "Examen beendet. Internet ist wieder freigeschaltet."
                : "Examen beendet.",
            firewall_error: result.ok ? undefined : result.stderr,
        });
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

/**
 * Verlängert das laufende oder pausierte Examen um Zusatzzeit
 * (Formularfeld `minutes`, Ganzzahl in Minuten, 1–600).
 */
apiRouter.post("/exam/extra", requireAdmin, async (c) => {
    const formData = await c.req.formData();
    const validation = AdminExamExtraSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message || "Ungültige Zusatzzeit",
            400,
        );
    }

    try {
        service.exam.addExtra(validation.data.minutes * 60);
        return await renderExamPanel(c, {
            success_message:
                `Zusatzzeit von ${validation.data.minutes} Minuten hinzugefügt.`,
        });
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

/**
 * Notausgang für Neuanmeldungen während eines Examens (#146).
 *
 * Während des Examens ist keine Neuanmeldung als Schüler möglich, damit
 * niemand den Namen wechselt. Dieser Endpunkt öffnet (oder schließt) das
 * Anmeldefenster für fünf Minuten; die Freigabe lebt nur im
 * Serverprozess und verfällt von selbst.
 */
apiRouter.post("/exam/registration-window", requireAdmin, async (c) => {
    const formData = await c.req.formData();
    const validation = AdminRegistrationWindowSchema.safeParse(formData);
    if (!validation.success) {
        return c.text(
            validation.error.issues[0]?.message ||
                "Ungültige Aktion für das Anmeldefenster.",
            400,
        );
    }

    if (validation.data.action === "open") {
        service.exam.openRegistrationWindow();
    } else {
        service.exam.closeRegistrationWindow();
    }

    return c.html(await buildRegistrationWindowPanel());
});

/**
 * Zustand für den Schüler-Countdown. Hier reicht die Anmeldung
 * (kein Admin): liefert `{ status, remaining_seconds }`, wobei
 * fehlender oder beendeter Exam-Zustand als `remaining_seconds: 0`
 * gemeldet wird.
 */
apiRouter.get("/exam/state", async (c) => {
    const session = getSession(c);
    if (!session.isLoggedIn()) {
        return c.json({ error: "Nicht angemeldet." }, 401);
    }

    const remaining = await service.exam.getRemainingSeconds();
    const state = service.exam.getState();

    return c.json({
        status: state?.status ?? "idle",
        remaining_seconds: remaining === null ? 0 : remaining,
    });
});

export default apiRouter;
