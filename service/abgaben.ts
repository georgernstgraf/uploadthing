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
 * Check whether a user is eligible to resubmit.
 *
 * Die WLAN-Regel schützt nur das **laufende** Examen (#164): geprüft wird
 * erst ab der letzten Abgabe, und nur wenn diese im laufenden Examen
 * liegt. Eine Abgabe von vor dem Exam-Start sagt nichts über das jetzige
 * Netz — sonst sperrt die Prüfung eine Schülerin, die seit Mai nicht mehr
 * anwesend war, obwohl im laufenden Examen nichts fehlt. Ohne
 * Exam-Zustand (`examStartedAt === null`) gibt es nichts zu schützen; der
 * Upload selbst ist ohnehin am Exam-Fenster gegated.
 */
export function canResubmit(
    userId: number,
    currentIp: string,
    examStartedAt: Date | null,
): boolean {
    const submissions = repo.abgaben.getByUserId(userId);
    if (submissions.length === 0) return true;
    if (examStartedAt === null) return true;

    const since = submissions[0].at;
    // Die letzte Abgabe liegt vor dem laufenden Examen: im Examen ist
    // noch nichts passiert, also gibt es keine Lücke zu prüfen.
    if (since.getTime() < examStartedAt.getTime()) return true;

    const now = new Date();
    // Scan-Achse aus `tikscan` (#163): leere Scans zählen mit, sonst wäre
    // ein Abruf ohne sichtbaren Client unsichtbar.
    const allScans = repo.ipfact.scansInRange(since, now);
    if (allScans.length === 0) return true;

    const ipSeens = repo.ipfact.getHistoryForIPInRangeDesc(currentIp, since, now);
    const ipSeenTimestamps = new Set(ipSeens.map((d) => d.toISOString()));

    const missedAnyScan = allScans.some((ts) =>
        !ipSeenTimestamps.has(ts.toISOString())
    );
    return !missedAnyScan;
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
