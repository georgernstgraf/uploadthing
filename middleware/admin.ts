import { createMiddleware } from "hono/factory";
import type { HonoContextVars } from "../lib/types.ts";

/**
 * Administrator-Sperre für Admin-Routen.
 *
 * `is_admin` wird in `middleware/session.ts` gesetzt
 * (Session-User mit `klasse === "LehrendeR"`). Anonyme und
 * Schüleranfragen werden mit 403 blockiert, bevor der
 * Routen-Handler läuft.
 */
export const requireAdmin = createMiddleware<{ Variables: HonoContextVars }>(
    async (c, next) => {
        if (!c.get("is_admin")) {
            return c.text("Forbidden", 403);
        }

        await next();
    },
);
