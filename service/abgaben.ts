import { AbgabeRecord } from "../repo/abgaben.ts";
import * as repo from "../repo/repo.ts";

export function recordSubmission(
    userId: number,
    ip: string,
    filename: string,
): AbgabeRecord {
    return repo.abgaben.create(userId, ip, filename, new Date());
}

export function getSubmissionsForUser(userId: number): AbgabeRecord[] {
    return repo.abgaben.getByUserId(userId);
}

export function getSubmissionsInRange(
    start: string,
    end: string,
): AbgabeRecord[] {
    return repo.abgaben.getByDateRange(start, end);
}
export function getUserSubmissionsInRange(
    userId: number,
    start: string,
    end: string,
): AbgabeRecord[] {
    return repo.abgaben.getByUserIdAndDateRange(userId, start, end);
}

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
