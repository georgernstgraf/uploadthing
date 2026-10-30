/**
 * Geordneter Shutdown per Signal (#156).
 *
 * Der Dienst fing SIGTERM ab, schloss SQLite und entfernte die
 * Signal-Listener — beendete den Prozess aber nie. systemd musste nach
 * `TimeoutStopSec` mit SIGKILL nachhelfen, jeder Neustart dauerte 20 s.
 * Außerdem lag das SQLite-Handle zu früh zu: es wurde geschlossen,
 * während der HTTP-Server noch Anfragen bediente.
 *
 * Die Reihenfolge hier ist deshalb: Hintergrundarbeit stoppen (ein
 * laufender MikroTik-Abruf schreibt in die Datenbank), Server abbrechen
 * und auslaufen lassen, erst dann SQLite schließen, dann `exit(0)`.
 * Ein Watchdog beendet den Prozess hart, falls ein Schritt hängt; ein
 * zweites Signal beendet sofort.
 */

/** Notbremse, falls das Aufräumen hängt — systemd killt danach ohnehin. */
export const SHUTDOWN_GRACE_MS = 10_000;

export type ShutdownSteps = {
    /** Stoppt Hintergrundarbeit, die noch in die Datenbank schreiben kann. */
    stopBackgroundWork: (signal: string) => Promise<void>;
    /** Bricht den HTTP-Server ab und wartet, bis laufende Anfragen fertig sind. */
    drainServer: (signal: string) => Promise<void>;
    /** Schließt das SQLite-Handle. */
    closeDatabase: (signal: string) => void;
    /** Beendet den Prozess. */
    exit: (code: number) => void;
};

export type ShutdownOptions = {
    /** Frist für das Aufräumen; danach `exit(1)`. */
    graceMs?: number;
    log?: (message: string) => void;
    logError?: (message: string, detail?: unknown) => void;
};

/**
 * Baut den Signal-Handler. Jeder Schritt wird einzeln abgesichert: ein
 * Fehler beim Stoppen des Pollings darf das Schließen der Datenbank
 * nicht verhindern.
 */
export function createShutdown(
    steps: ShutdownSteps,
    options: ShutdownOptions = {},
): (signal: string) => Promise<void> {
    const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS;
    const log = options.log ?? ((message: string) => console.log(message));
    const logError = options.logError ??
        ((message: string, detail?: unknown) =>
            console.error(detail === undefined ? message : `${message} ${detail}`));

    let shuttingDown = false;

    return async (signal: string): Promise<void> => {
        if (shuttingDown) {
            logError(`${signal} erneut empfangen — beende sofort.`);
            steps.exit(1);
            return;
        }
        shuttingDown = true;

        log(`Received ${signal}, shutting down HTTP server...`);

        // Der Timer darf den Prozess nicht am Leben halten, wenn sonst
        // nichts mehr läuft — dann ist der natürliche Exit ohnehin richtig.
        const watchdog = setTimeout(() => {
            logError(
                `Shutdown hängt seit ${graceMs} ms — beende hart (SIGKILL vermeiden).`,
            );
            steps.exit(1);
        }, graceMs);
        Deno.unrefTimer(watchdog);

        try {
            await steps.stopBackgroundWork(signal);
        } catch (error) {
            logError("Hintergrundarbeit ließ sich nicht stoppen:", error);
        }

        try {
            await steps.drainServer(signal);
        } catch (error) {
            logError("HTTP-Server ließ sich nicht sauber beenden:", error);
        }

        try {
            steps.closeDatabase(signal);
        } catch (error) {
            logError("SQLite ließ sich nicht schließen:", error);
        }

        clearTimeout(watchdog);
        log("Shutdown abgeschlossen.");
        steps.exit(0);
    };
}
