import { createMiddleware } from "hono/factory";

/**
 * Security-Header für jede Antwort.
 *
 * Bewusst **nur** `upgrade-insecure-requests`: Der Header zieht jede vom
 * Dokument angeforderte `http://`-Ressource automatisch auf https — egal,
 * ob sie aus einem alten Cache, von einer Browser-Extension oder von einem
 * Proxy stammt. Ohne ihn zeigt Chrome bei gültigem Zertifikat trotzdem
 * „Not secure" (Mixed Content), genau das war am 2026-10-31 zu sehen.
 *
 * Bewusst **kein** `Strict-Transport-Security`: Es gibt keinen
 * http-Dienst, der abzusichern wäre (Port 80 ist zu, keine Subdomains),
 * also fast keinen Gewinn. Der Preis wäre hoch — HSTS nimmt die
 * „Trotzdem fortfahren"-Notbremse weg, und die Zertifikatserneuerung ist
 * laut `docs/ai/OPERATIONS.md` manuell (2×/Jahr, Deno liest Zertifikat und
 * Key nur beim Start). Ein schiefgelaufener Tausch würde den Dienst dann
 * für die gesamte `max-age`-Dauer unbenutzbar machen, auch im Examen.
 */
export function securityHeaderValues(): Record<string, string> {
    return {
        "Content-Security-Policy": "upgrade-insecure-requests",
    };
}

export const securityHeaders = createMiddleware(async (c, next) => {
    await next();
    // Nach `next()`, damit auch 4xx/5xx-Antworten aus `errorHandler`
    // und Fragment-Antworten für HTMX die Header tragen.
    for (const [name, value] of Object.entries(securityHeaderValues())) {
        c.header(name, value);
    }
});
