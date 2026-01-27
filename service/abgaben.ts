import { RepoAbgabeRecord } from "../repo/abgaben.ts";
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
 * Fetch submissions for an IP within a date range.
 */
export function getIPSubmissionsInRange(
    ip: string,
    start: Date,
    end: Date,
): Record<string, string>[] {
    const submissions = repo.abgaben.getByIPAndDateRange(ip, start, end);
    return submissions.map((submission) => ({
        [submission.at.toISOString()]: submission.filename,
    }));
}
