import { RepoAbgabeRecord } from "../repo/abgaben.ts";
import { localAdminIpString } from "../lib/timefunc.ts";
import * as repo from "../repo/repo.ts";

/**
 * Persist a new submission record for a user and IP.
 */
export function recordSubmission(
    userId: number,
    ip: string,
    filename: string,
): RepoAbgabeRecord {
    return repo.abgaben.create(userId, ip, filename, new Date());
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
 * A resubmission is allowed only if the student's IP was present
 * in every network scan since their most recent submission.
 */
export function canResubmit(userId: number, currentIp: string): boolean {
    const submissions = repo.abgaben.getByUserId(userId);
    if (submissions.length === 0) return true;

    const since = submissions[0].at;
    const now = new Date();
    const allScans = repo.ipfact.getUniqueScanTimestamps(since, now);
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
