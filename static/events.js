/**
 * Exam-Zustand als Push (#161).
 *
 * Der Server schickt den vollständigen Zustand über
 * `GET /events/exam` (Server-Sent Events). Dieses Skript ist der einzige
 * Besitzer des Countdowns: es kennt den Offset zwischen Server- und
 * Browseruhr und rechnet damit aus `data-ends-at-ms`. Alpine bleibt nur
 * für den Dateinamen (Drag & Drop) im Panel.
 *
 * Die drei Aufgaben:
 * 1. Countdown ticken und bei jedem Frame mit der Serverzeit abgleichen
 *    (nach einer Pause/Fortsetzung läuft er so wieder synchron).
 * 2. Das Abgabe-Panel dem Zustand nachziehen — ohne Hover, ohne Klick.
 * 3. Das Admin-Panel bei Status- und Freigabe-Änderungen neu holen.
 * 4. Die Admin-Forensik (`/admin/events`) bei Aktivität neu holen —
 *    außer es sind Details offen, dann zählt ein Badge die Ereignisse.
 *
 * Verbunden wird nur auf Seiten mit `data-exam-events` am `<body>`, also
 * nur für angemeldete Personen. Ohne Sitzung antwortet der Endpunkt mit
 * 401; dann wird nach ein paar Fehlversuchen aufgegeben, statt alle drei
 * Sekunden weiterzuklopfen.
 */

(function () {
    "use strict";

    /** Abstand zwischen zwei Admin-Panel-Refreshes. */
    const ADMIN_REFRESH_MIN_MS = 1000;

    /** Aufgeben, wenn so viele Verbindungsfehler ohne Frame kommen. */
    const MAX_ERRORS_WITHOUT_FRAME = 3;

    /**
     * Ab hier gilt der Admin-Aktivitätsstream als stumm. Beim Sichtbarwerden
     * des Tabs oder nach `online` wird dann einmal nachgeholt — statt
     * selbst einen Reconnect-Timer zu bauen (EventSource verbindet
     * ohnehin selbst neu).
     */
    const ADMIN_STALE_MS = 60_000;

    /**
     * Ab dieser Abweichung wird der lokale Endzeitpunkt vom Frame
     * überschrieben. Kleinere Sprünge sind Rundung: der Server rechnet
     * `remaining_seconds` auf ganze Sekunden auf. Würde jeder Frame den
     * Endzeitpunkt neu setzen, spränge die Anzeige bei jedem Verbinden
     * um bis zu eine Sekunde zurück.
     */
    const COUNTDOWN_RESYNC_MS = 1500;

    const RUNNING_BADGE_CLASS =
        "badge rounded-pill px-3 py-2 fs-6 text-bg-primary";
    const PAUSED_BADGE_CLASS =
        "badge rounded-pill px-3 py-2 fs-6 text-bg-warning";

    /** Serveruhr minus Browseruhr, aus `server_now_ms` des letzten Frames. */
    let serverOffsetMs = 0;

    let lastFrame = null;
    let lastStatus = null;
    let lastRegistrationOpen = null;

    let panelRequestInFlight = false;
    let uploadInFlight = false;
    let pendingClose = false;

    let adminRefreshTimer = null;
    let adminRefreshAt = 0;
    let pendingAdminRefresh = false;

    let errorCount = 0;

    // Admin-Forensik (#161): eigener Stream, eigener Zähler.
    let adminReportErrorCount = 0;
    let adminReportFrames = 0;
    let adminReportLastFrameAt = 0;
    let adminReportPending = 0;

    let countdownTimer = null;

    // ------------------------------------------------------------------
    // Countdown
    // ------------------------------------------------------------------

    function serverNowMs() {
        return Date.now() + serverOffsetMs;
    }

    /**
     * Wartezeit bis zur nächsten sichtbaren Änderung: die Anzeige ist
     * aufgerundet und springt genau dann, wenn die Restzeit eine ganze
     * Sekunde unterschreitet. Ein fester 1-s-Takt hinge an seiner
     * Startphase und könnte bis zu zwei Sekunden hinterherhinken — nach
     * dem Verbinden wäre das ein sichtbarer Sprung.
     */
    function nextCountdownDelay() {
        const element = document.getElementById("exam-countdown");
        if (!element || element.dataset.paused === "true") {
            return 1000;
        }
        const endsAtMs = Number(element.dataset.endsAtMs || "0");
        const remainingMs = endsAtMs - serverNowMs();
        if (!endsAtMs || remainingMs <= 0) {
            return 1000;
        }
        const untilCrossing = remainingMs -
            (Math.ceil(remainingMs / 1000) - 1) * 1000;
        return Math.min(1000, Math.max(50, untilCrossing + 20));
    }

    function scheduleCountdownTick() {
        if (countdownTimer !== null) {
            window.clearTimeout(countdownTimer);
        }
        countdownTimer = window.setTimeout(function () {
            countdownTimer = null;
            updateCountdown(null);
            scheduleCountdownTick();
        }, nextCountdownDelay());
    }

    /** Format wie `durationString()` im Server (`h:mm:ss` bzw. `mm:ss`). */
    function formatRemaining(totalSeconds) {
        const seconds = Math.max(0, Math.ceil(totalSeconds));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const rest = seconds % 60;
        const minutePart = hours > 0
            ? String(minutes).padStart(2, "0")
            : String(minutes);
        return `${hours > 0 ? `${hours}:` : ""}${minutePart}:${
            String(rest).padStart(2, "0")
        }`;
    }

    /**
     * Zeichnet den Countdown. `frame` ist der frische Serverzustand; ohne
     * Frame (Sekundentakt) wird nur aus den Datenattributen gerechnet.
     */
    function updateCountdown(frame) {
        const element = document.getElementById("exam-countdown");
        if (!element) {
            return;
        }
        const badge = document.getElementById("exam-countdown-badge");
        if (!badge) {
            return;
        }

        if (frame) {
            const previousEndsAt = Number(element.dataset.endsAtMs || "0");
            const nextEndsAt = typeof frame.ends_at_ms === "number"
                ? frame.ends_at_ms
                : 0;
            if (!nextEndsAt) {
                delete element.dataset.endsAtMs;
            } else if (
                !previousEndsAt ||
                Math.abs(nextEndsAt - previousEndsAt) > COUNTDOWN_RESYNC_MS
            ) {
                // Neue Restzeit (Fortsetzen, Zusatzzeit, frisch
                // gerendertes Panel) — übernehmen. Kleine Abweichungen
                // sind nur die Aufrundung des Servers.
                element.dataset.endsAtMs = String(nextEndsAt);
            }
            element.dataset.paused = frame.status === "paused"
                ? "true"
                : "false";
        }

        if (element.dataset.paused === "true") {
            // Die Restzeit steht im Frame; ohne Frame bleibt der
            // serverseitig gerenderte Text stehen.
            if (frame) {
                badge.className = PAUSED_BADGE_CLASS;
                badge.textContent = `Prüfungszeit pausiert – Restzeit: ${
                    formatRemaining(frame.remaining_seconds)
                }`;
            }
            return;
        }

        const endsAtMs = Number(element.dataset.endsAtMs || "0");
        if (!endsAtMs) {
            return;
        }

        const remaining = (endsAtMs - serverNowMs()) / 1000;
        badge.className = RUNNING_BADGE_CLASS;
        badge.textContent = `Restzeit: ${formatRemaining(remaining)}`;
    }

    // ------------------------------------------------------------------
    // Abgabe-Panel
    // ------------------------------------------------------------------

    function requestPanel() {
        if (typeof window.htmx === "undefined" || panelRequestInFlight) {
            return;
        }
        panelRequestInFlight = true;
        window.htmx.ajax("GET", "/abgabe-panel", {
            target: "#abgabe-panel",
            swap: "innerHTML",
        }).catch(function () {
            // Netzfehler: der nächste Zustandswechsel versucht es erneut.
        }).finally(function () {
            panelRequestInFlight = false;
        });
    }

    function swapToClosed() {
        pendingClose = false;
        requestPanel();
        if (typeof window.showToast === "function") {
            window.showToast(
                "Das Examen ist beendet. Uploads sind nicht mehr möglich.",
                "warning",
            );
        }
    }

    /**
     * Bringt das Panel auf den Stand des Frames. Maßgeblich ist `open`,
     * nicht `status`: ein abgelaufenes, noch nicht aufgeräumtes Examen
     * meldet `running` mit `open: false`.
     */
    function syncPanel(frame) {
        const panel = document.getElementById("abgabe-panel");
        if (!panel) {
            // Kein Abgabe-Panel auf dieser Seite (z. B. /whoami).
            return;
        }

        const hasForm = Boolean(document.getElementById("abgabe-form"));

        if (frame.open) {
            // Formular fehlt: das Examen hat begonnen.
            if (!hasForm) {
                requestPanel();
            }
            // Formular steht: nichts tauschen — sonst ginge die gewählte
            // Datei verloren. Der Countdown folgt trotzdem dem Frame.
            return;
        }

        if (!hasForm) {
            return;
        }

        // Ein laufender Upload darf nicht unterbrochen werden: erst nach
        // seiner Antwort ersetzen (siehe `handleRequestEnd`).
        if (uploadInFlight) {
            pendingClose = true;
            return;
        }

        swapToClosed();
    }

    function isAbgabeFormRequest(event) {
        const element = event.detail && event.detail.elt;
        return Boolean(
            element && element.closest && element.closest("#abgabe-form"),
        );
    }

    function handleRequestEnd(event) {
        if (!isAbgabeFormRequest(event)) {
            return;
        }
        uploadInFlight = false;
        if (!pendingClose) {
            return;
        }
        // Nach dem Swap des Uploads prüfen: `afterRequest` feuert nach
        // `afterSwap`, der Timeout lässt htmx den Austausch abschließen.
        window.setTimeout(function () {
            if (lastFrame && !lastFrame.open) {
                swapToClosed();
            }
        }, 0);
    }

    // ------------------------------------------------------------------
    // Admin-Panel
    // ------------------------------------------------------------------

    function isTypingInAdminPanel() {
        const active = document.activeElement;
        if (!active || !active.closest) {
            return false;
        }
        return active.closest("#exam-admin-panel") !== null &&
            /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
    }

    function refreshAdminPanel() {
        const panel = document.getElementById("exam-admin-panel");
        if (!panel) {
            return;
        }
        // Nicht unter den Fingern tauschen: das Minutenfeld würde seinen
        // eingegebenen Wert verlieren. Der Swap wartet auf `focusout`.
        if (isTypingInAdminPanel()) {
            pendingAdminRefresh = true;
            return;
        }
        // Auch nicht mitten in einer laufenden Admin-Aktion: deren
        // Antwort ist jünger als unser GET und würde sonst von einem
        // älteren Stand überschrieben. htmx markiert das anfragende
        // Element (im Panel) während der Anfrage mit `.htmx-request`;
        // der Marker verschwindet vor `htmx:afterRequest`.
        if (panel.querySelector(".htmx-request")) {
            pendingAdminRefresh = true;
            scheduleAdminRefresh();
            return;
        }
        pendingAdminRefresh = false;
        if (typeof window.htmx === "undefined") {
            return;
        }
        window.htmx.ajax("GET", "/api/exammode", {
            target: "#exam-admin-panel",
            swap: "outerHTML",
        }).catch(function () {
            // Der nächste Zustandswechsel versucht es erneut.
        });
    }

    function scheduleAdminRefresh() {
        if (adminRefreshTimer !== null) {
            return;
        }
        const wait = Math.max(0, adminRefreshAt - Date.now());
        adminRefreshTimer = window.setTimeout(function () {
            adminRefreshTimer = null;
            adminRefreshAt = Date.now() + ADMIN_REFRESH_MIN_MS;
            refreshAdminPanel();
        }, wait);
    }

    document.addEventListener("focusout", function () {
        if (!pendingAdminRefresh) {
            return;
        }
        // Erst nach dem Fokuswechsel entscheiden, ob im Panel weiter
        // getippt wird.
        window.setTimeout(refreshAdminPanel, 0);
    });

    // ------------------------------------------------------------------
    // Admin-Forensik (#161)
    // ------------------------------------------------------------------

    function adminReportPanel() {
        return document.getElementById("admin-report-panel");
    }

    /**
     * Solange Details oder das Anomalie-Accordion offen sind, darf das
     * Panel nicht getauscht werden: der Swap zerstört alles im Panel,
     * also auch die offene Ansicht. Das IP-Detail-Modal liegt außerhalb,
     * würde aber über einem still veralteten Panel stehen.
     */
    function adminReportFrozen() {
        const panel = adminReportPanel();
        if (!panel) {
            return false;
        }
        return Boolean(
            panel.querySelector("details[open]") ||
                document.querySelector("#admin-anomaly-collapse.show") ||
                document.querySelector("#ip-detail-modal.show"),
        );
    }

    function setAdminReportPending(count) {
        adminReportPending = Math.max(0, count);
        const badge = document.getElementById("admin-refresh-pending");
        if (!badge) {
            return;
        }
        if (adminReportPending === 0) {
            badge.classList.add("d-none");
            badge.textContent = "";
            return;
        }
        badge.classList.remove("d-none");
        badge.textContent = adminReportPending === 1
            ? "1 neues Ereignis"
            : `${adminReportPending} neue Ereignisse`;
    }

    function countAdminReportFrame() {
        setAdminReportPending(adminReportPending + 1);
    }

    function requestAdminReportRefresh() {
        const panel = adminReportPanel();
        if (!panel || typeof window.htmx === "undefined") {
            return;
        }
        window.htmx.trigger(panel, "admin-refresh");
    }

    /** Holt nach, was während des Freeze liegen geblieben ist. */
    function flushAdminReport() {
        if (adminReportPending === 0 || adminReportFrozen()) {
            return;
        }
        requestAdminReportRefresh();
    }

    /** Auffrischen oder — bei offenen Details — zählen. */
    function requestAdminReportOnDemand() {
        if (adminReportFrozen()) {
            countAdminReportFrame();
            return;
        }
        requestAdminReportRefresh();
    }

    /** „Stand HH:MM:SS" aus der Serverzeit des Frames. */
    function updateAdminReportStand(frame) {
        const element = document.getElementById("admin-refresh-stand");
        if (!element) {
            return;
        }
        const ms = typeof frame.server_now_ms === "number"
            ? frame.server_now_ms
            : Date.parse(frame.at);
        if (!Number.isFinite(ms)) {
            return;
        }
        const date = new Date(ms);
        const pad = (value) => String(value).padStart(2, "0");
        element.textContent = `Stand: ${pad(date.getHours())}:${
            pad(date.getMinutes())
        }:${pad(date.getSeconds())}`;
    }

    function handleAdminActivityFrame(frame) {
        if (!frame || frame.type !== "activity") {
            return;
        }
        adminReportErrorCount = 0;
        const first = adminReportFrames === 0;
        adminReportFrames += 1;
        adminReportLastFrameAt = Date.now();
        updateAdminReportStand(frame);

        const hasReasons = Array.isArray(frame.reasons) &&
            frame.reasons.length > 0;
        // Der erste Frame bestätigt den ohnehin gerenderten Stand; nur
        // wenn er bereits Ereignisse trägt, könnte das Rendern älter sein.
        if (first && !hasReasons) {
            return;
        }

        requestAdminReportOnDemand();
    }

    function connectAdminActivity() {
        const source = new EventSource("/admin/events");
        window.__uploadthingAdminEvents = source;

        source.addEventListener("activity", function (event) {
            let frame = null;
            try {
                frame = JSON.parse(event.data);
            } catch (error) {
                console.error("Admin-Ereignis ist kein JSON:", error);
                return;
            }
            handleAdminActivityFrame(frame);
        });

        source.addEventListener("open", function () {
            adminReportErrorCount = 0;
        });

        source.addEventListener("error", function () {
            adminReportErrorCount += 1;
            // Dauerhaftes 403 (keine Lehrperson): kein Reconnect-Karussell.
            if (adminReportErrorCount >= MAX_ERRORS_WITHOUT_FRAME) {
                source.close();
            }
        });
    }

    // Wer den Tab wieder ansieht oder das Netz zurückkommt, holt einen
    // verstummten Stream einmal nach. EventSource verbindet selbst neu.
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") {
            return;
        }
        if (
            adminReportLastFrameAt === 0 ||
            Date.now() - adminReportLastFrameAt > ADMIN_STALE_MS
        ) {
            requestAdminReportOnDemand();
        }
    });

    window.addEventListener("online", function () {
        if (
            adminReportLastFrameAt === 0 ||
            Date.now() - adminReportLastFrameAt > ADMIN_STALE_MS
        ) {
            requestAdminReportOnDemand();
        }
    });

    // Der htmx-Riegel in `index.hbs` bricht den Request ab, wenn Details
    // offen sind. Er meldet das als Event, damit der Zähler nicht still
    // geschluckt wird.
    document.addEventListener("admin-refresh-frozen", function () {
        countAdminReportFrame();
    });

    // Ein echter Swap setzt den Zähler zurück: der Stand ist jetzt frisch.
    document.addEventListener("htmx:afterSwap", function (event) {
        const target = event.detail && event.detail.target;
        if (target && target.id === "admin-report-panel") {
            setAdminReportPending(0);
        }
    });

    // Das letzte offene Detail geschlossen (Toggle blubbert nicht), das
    // Accordion zugeklappt oder das Detail-Modal geschlossen: Nachlauf.
    document.addEventListener("toggle", function (event) {
        const element = event.target;
        if (element && element.tagName === "DETAILS" && !element.open) {
            window.setTimeout(flushAdminReport, 0);
        }
    }, true);

    document.addEventListener("hidden.bs.collapse", function (event) {
        const element = event.target;
        if (element && element.id === "admin-anomaly-collapse") {
            window.setTimeout(flushAdminReport, 0);
        }
    });

    document.addEventListener("hidden.bs.modal", function (event) {
        const element = event.target;
        if (element && element.id === "ip-detail-modal") {
            window.setTimeout(flushAdminReport, 0);
        }
    });

    // ------------------------------------------------------------------
    // Frames und Verbindung
    // ------------------------------------------------------------------

    function handleFrame(frame) {
        if (!frame || frame.type !== "exam") {
            return;
        }
        errorCount = 0;

        if (typeof frame.server_now_ms === "number") {
            // Der Offset kommt aus derselben Serverzeit wie `ends_at_ms`;
            // damit rechnet der Countdown auch zwischen zwei Frames mit
            // der Serveruhr.
            serverOffsetMs = frame.server_now_ms - Date.now();
            window.__uploadthingServerOffset = serverOffsetMs;
        }

        const isFirst = lastStatus === null;
        const statusChanged = frame.status !== lastStatus;
        const registrationChanged =
            frame.registration_open !== lastRegistrationOpen;

        lastFrame = frame;
        lastStatus = frame.status;
        lastRegistrationOpen = frame.registration_open;

        updateCountdown(frame);
        scheduleCountdownTick();
        syncPanel(frame);

        // Der erste Frame bestätigt nur den ohnehin gerenderten Zustand.
        if (!isFirst && (statusChanged || registrationChanged)) {
            scheduleAdminRefresh();
        }
    }

    function connect() {
        const source = new EventSource("/events/exam");
        window.__uploadthingExamEvents = source;

        source.addEventListener("exam", function (event) {
            let frame = null;
            try {
                frame = JSON.parse(event.data);
            } catch (error) {
                console.error("Exam-Ereignis ist kein JSON:", error);
                return;
            }
            handleFrame(frame);
        });

        source.addEventListener("open", function () {
            errorCount = 0;
        });

        source.addEventListener("error", function () {
            errorCount += 1;
            // Dauerhaftes 401/403: kein Reconnect-Karussell.
            if (errorCount >= MAX_ERRORS_WITHOUT_FRAME) {
                source.close();
            }
        });
    }

    function init() {
        // Der Countdown läuft auch ohne Verbindung weiter (die Anzeige
        // ist serverseitig geseedet); ein Frame korrigiert sie.
        scheduleCountdownTick();

        // Ein frisch getauschtes Panel bringt einen neuen Countdown mit:
        // sofort zeichnen und den Timer auf dessen Endzeit neu stellen.
        document.addEventListener("htmx:afterSwap", function (event) {
            const target = event.detail && event.detail.target;
            if (target && target.id === "abgabe-panel") {
                updateCountdown(null);
                scheduleCountdownTick();
            }
        });

        document.addEventListener("htmx:beforeRequest", function (event) {
            if (isAbgabeFormRequest(event)) {
                uploadInFlight = true;
            }
        });
        document.addEventListener("htmx:afterRequest", function (event) {
            handleRequestEnd(event);
            // Ein Swap, der wegen einer laufenden Anfrage verschoben
            // wurde, holt sich hier seinen Nachlauf.
            if (pendingAdminRefresh) {
                scheduleAdminRefresh();
            }
        });

        if (document.body.dataset.examEvents !== undefined) {
            connect();
        }

        // Nur die Forensik-Seite trägt dieses Panel; alle anderen Seiten
        // verbinden den Admin-Kanal gar nicht erst.
        if (document.getElementById("admin-report-panel")) {
            connectAdminActivity();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
