import { Hono } from "hono";
import * as hbs from "../lib/handlebars.ts";
import * as service from "../service/service.ts";
import { HonoContextVars } from "../lib/types.ts";
import { getSession } from "../middleware/session.ts";
import { requireAdmin } from "../middleware/admin.ts";
import {
    AdminExamExtraSchema,
    AdminExamModeSchema,
    AdminExamStartSchema,
} from "../lib/schemas.ts";

/**
 * API-Router — wird in `main.ts` ausschließlich unter `/api` gemountet.
 * Der externe `POST /activeips`-Vertrag liegt in `routes/machine.ts`
 * am Root-Mount.
 */
const apiRouter = new Hono<{ Variables: HonoContextVars }>();

apiRouter.get("/exammode", requireAdmin, async (c) => {
    try {
        const result = await service.admin.getExamModeStatus();
        if (!result.ok) {
            const details = [result.stderr, result.stdout].filter(Boolean).join(" | ");
            console.error("exammode status failed:", result);
            return c.text(
                `exammode status fehlgeschlagen (Exit ${result.code})${details ? `: ${details}` : ""}`,
                500,
            );
        }

        return c.html(hbs.adminExamModeTemplate({
            internet_active: result.internet_active,
        }));
    } catch (error) {
        console.error("exammode status could not be executed:", error);
        return c.text(`exammode status konnte nicht ausgeführt werden: ${(error as Error).message}`, 500);
    }
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

/**
 * Startet ein Examen mit vorgegebener Dauer (Formularfeld `minutes`,
 * Ganzzahl in Minuten, 1–600). Ungültige Übergänge der State-Machine
 * (z. B. Start während eines laufenden Examens) werden mit 409
 * und deutscher Fehlermeldung gemeldet.
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
        service.exam.start(validation.data.minutes * 60);
        return c.text(`Examen gestartet. Dauer: ${validation.data.minutes} Minuten.`);
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

apiRouter.post("/exam/pause", requireAdmin, (c) => {
    try {
        service.exam.pause();
        return c.text("Examen pausiert.");
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

apiRouter.post("/exam/resume", requireAdmin, (c) => {
    try {
        service.exam.resume();
        return c.text("Examen fortgesetzt.");
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
});

/**
 * Stoppt das Examen vorzeitig und schaltet das Internet frei
 * (Exam Mode Off). Schlägt der Firewall-Befehl fehl, bleibt der
 * Exam-Zustand auf stopped, die Antwort meldet den Fehler aber als
 * 500-Text, damit der globale HTMX-Toast ihn anzeigt.
 */
apiRouter.post("/exam/stop", requireAdmin, async (c) => {
    try {
        const result = await service.exam.stop();
        if (!result.ok) {
            const details = [result.stderr, result.stdout].filter(Boolean).join(" | ");
            console.error("exammode failed:", result);
            return c.text(
                `exammode fehlgeschlagen (Exit ${result.code})${details ? `: ${details}` : ""}`,
                500,
            );
        }

        return c.text("Examen beendet. Internet ist wieder freigeschaltet.");
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
        return c.text(`Zusatzzeit von ${validation.data.minutes} Minuten hinzugefügt.`);
    } catch (error) {
        return c.text((error as Error).message, 409);
    }
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
