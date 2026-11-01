import { RepoAbgabeRecord } from "../repo/abgaben.ts";
import { localAdminIpString } from "../lib/timefunc.ts";
import { ipSlug } from "../lib/slug.ts";
import * as repo from "../repo/repo.ts";
import { noteAdminActivity } from "./events.ts";

/**
 * Persist a new submission record for a user and IP.
 */
export function recordSubmission(
    userId: number,
    ip: string,
    filename: string,
): RepoAbgabeRecord {
    const record = repo.abgaben.create(userId, ip, filename, new Date());
    // Die „Abgabe"-Badge der Forensik hängt an dieser Zeile — nur das
    // Kärtchen dieser IP ändert sich, nicht das ganze Panel (#163).
    noteAdminActivity(`card-${ipSlug(ip)}`);
    return record;
}

/**
 * Fetch all submissions for a user.
 */
export function getSubmissionsForUser(userId: number): RepoAbgabeRecord[] {
    return repo.abgaben.getByUserId(userId);
}

/**
 * Fetch all submissions within a date range.
 */
export function getSubmissionsInRange(
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    return repo.abgaben.getByDateRange(start, end);
}
/**
 * Fetch submissions for a user within a date range.
 */
export function getUserSubmissionsInRange(
    userId: number,
    start: Date,
    end: Date,
): RepoAbgabeRecord[] {
    return repo.abgaben.getByUserIdAndDateRange(userId, start, end);
}

/**
 * Prüf-Ergebnis für eine Abgabe im laufenden Examen (#166): die WLAN-
 * Unterbrechungen, die im Dateinamen und im Warnband landen.
 *
 * Bewusst keine Sperre mehr: wer das WLAN verlassen hat, darf trotzdem
 * abgeben. Die Abgabe ist nur am Exam-Fenster gegated.
 */
export type ExamPresence = {
    /** Zusammenhängende Blöcke fehlender Scans seit der ersten Sichtung. */
    dropouts: number;
    /** Fehlende Scans × 1 Minute (Poll-Intervall des MikroTik). */
    missed_minutes: number;
    /** Kam der Schüler im Examen unter mehr als einer IP? */
    ip_change: boolean;
};

/** Nichts zu melden — außerhalb eines Examens oder ohne Scan-Daten. */
export const NO_EXAM_PRESENCE: ExamPresence = {
    dropouts: 0,
    missed_minutes: 0,
    ip_change: false,
};

/**
 * Reiner Zählkern über die Scan-Achse (#166).
 *
 * `scans` aufsteigend, `seen` die ISO-Zeitstempel, in denen der Schüler
 * sichtbar war. Jeder fehlende Scan ist eine Minute ohne WLAN; ein
 * zusammenhängender Block fehlender Scans ist **ein** Dropout.
 */
export function countMissed(
    scans: Date[],
    seen: Set<string>,
): { missed: number; dropouts: number } {
    let missed = 0;
    let dropouts = 0;
    let inDropout = false;

    for (const scan of scans) {
        if (seen.has(scan.toISOString())) {
            inDropout = false;
            continue;
        }
        missed += 1;
        if (!inDropout) {
            dropouts += 1;
            inDropout = true;
        }
    }

    return { missed, dropouts };
}

/**
 * Anwesenheitsbild eines Schülers im laufenden Examen (#166).
 *
 * Grundlage sind die IPs, unter denen der Schüler seit dem Exam-Start
 * aufgetreten ist (Präsenzzeilen, Registrierungen und eigene Abgaben) —
 * nicht nur die aktuelle IP. Ein DHCP-Wechsel nach einem Dropout zählt
 * dadurch weiter; `ip_change` macht ihn im Dateinamen sichtbar.
 *
 * Gezählt wird ab der **ersten Sichtung** im Examensfenster: die Zeit
 * vor dem ersten Erscheinen im Netz ist kein Dropout (Spätankömmling).
 * Ohne Exam-Zustand oder ohne Scan-Daten gibt es nichts zu melden.
 */
export function examPresence(
    userId: number,
    currentIp: string,
    examStartedAt: Date | null,
    now: Date = new Date(),
): ExamPresence {
    if (examStartedAt === null) {
        return NO_EXAM_PRESENCE;
    }

    const ips = new Set<string>([currentIp]);
    for (const submission of repo.abgaben.getByUserIdAndDateRange(userId, examStartedAt, now)) {
        ips.add(submission.ip);
    }
    for (const presence of repo.cookiepresents.byUserInRange(userId, examStartedAt, now)) {
        ips.add(presence.ip);
    }
    for (const registration of repo.registrations.byUserInRange(userId, examStartedAt, now)) {
        ips.add(registration.ip);
    }

    const seen = new Set<string>();
    let firstSeen: Date | null = null;
    for (const ip of ips) {
        for (const at of repo.ipfact.getHistoryForIPInRangeDesc(ip, examStartedAt, now)) {
            seen.add(at.toISOString());
            if (firstSeen === null || at.getTime() < firstSeen.getTime()) {
                firstSeen = at;
            }
        }
    }

    const ip_change = ips.size > 1;
    if (firstSeen === null) {
        // Der Schüler war im Examen noch in keinem Scan sichtbar — etwa
        // direkt nach dem Start. Es gibt keine Lücke zu zählen.
        return { dropouts: 0, missed_minutes: 0, ip_change };
    }

    const scans = repo.ipfact.scansInRange(examStartedAt, now).filter(
        (scan) => scan.getTime() >= firstSeen.getTime(),
    );
    const { missed, dropouts } = countMissed(scans, seen);

    return { dropouts, missed_minutes: missed, ip_change };
}

/**
 * Fetch submissions for an IP within a date range.
 */
export function getIPSubmissionsInRange(
    ip: string,
    start: Date,
    end: Date,
): { at: string; filename: string }[] {
    const submissions = repo.abgaben.getByIPAndDateRange(ip, start, end);
    return submissions.map((submission) => ({
        at: localAdminIpString(submission.at),
        filename: submission.filename,
    }));
}
