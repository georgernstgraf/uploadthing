import { createMiddleware } from "hono/factory";
import type { HonoContextVars } from "../lib/types.ts";

/**
 * Administrator-Sperre für Admin-Routen.
 *
 * `is_admin` wird in `middleware/session.ts` gesetzt (Session-User mit
 * `klasse === "LehrendeR"`, siehe `service.user.isTeacher()`). Die
 * MAC-Freigabe (#147) ändert daran nichts: sie regelt nur, von welchem
 * Gerät sich eine Lehrperson anmelden darf. Anonyme und Schüleranfragen
 * werden mit 403 blockiert, bevor der Routen-Handler läuft.
 */
export const requireAdmin = createMiddleware<{ Variables: HonoContextVars }>(
    async (c, next) => {
        if (!c.get("is_admin")) {
            return c.text("Forbidden", 403);
        }

        await next();
    },
);
