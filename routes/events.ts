import { Hono } from "hono";
import { HonoContextVars } from "../lib/types.ts";
import { formatEvent, openEventStream } from "../lib/sse.ts";
import { getSession } from "../middleware/session.ts";
import * as events from "../service/events.ts";

/**
 * Push-Endpunkt für den Exam-Zustand (#161).
 *
 * `/events/exam` steht **jeder angemeldeten Person** offen — Schüler für
 * das Abgabe-Panel, Lehrpersonen für das Admin-Panel. Auch Admins brauchen
 * den Kanal: endet das Examen natürlich, soll ihr Panel nicht auf „Examen
 * läuft" stehen bleiben.
 *
 * Ohne Sitzung gibt es 401 und gar keinen Stream; der Client verbindet
 * dann nicht (sein `EventSource` bekommt keinen 200er).
 */
const eventsRouter = new Hono<{ Variables: HonoContextVars }>();

eventsRouter.get("/events/exam", (c) => {
    if (!getSession(c).isLoggedIn()) {
        return c.text("Nicht angemeldet.", 401);
    }

    return openEventStream(c.req.raw, {
        onOpen: (stream) => {
            // Erst abonnieren, dann den ersten Frame bauen: ein Tick
            // zwischen beiden Schritten kann so nicht verloren gehen
            // (der erste Frame entsteht nach ihm und ist damit frisch).
            const unsubscribe = events.subscribeExam(() => {
                stream.write(formatEvent("exam", events.snapshotExam()));
            });

            // Beim Verbinden sofort der vollständige Zustand. Der
            // Snapshot wird synchron gebaut (kein `await` zwischen
            // DB-Read und Write), damit der Shutdown die Datenbank nicht
            // unter einem laufenden Read schließt. Die Schreibkette in
            // `lib/sse.ts` hält die Reihenfolge, auch wenn mehrere Ticks
            // schnell hintereinander kommen.
            stream.write(formatEvent("exam", events.snapshotExam()));

            return unsubscribe;
        },
    });
});

export default eventsRouter;
