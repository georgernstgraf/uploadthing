import { AbgabeRecord } from "../repo/abgaben.ts";
import * as repo from "../repo/repo.ts";

export function recordSubmission(userId: number, filename: string): AbgabeRecord {
    return repo.abgaben.create(userId, filename, new Date());
}

export function getSubmissionsForUser(userId: number): AbgabeRecord[] {
    return repo.abgaben.getByUserId(userId);
}

export function getSubmissionsInRange(start: string, end: string): AbgabeRecord[] {
    return repo.abgaben.getByDateRange(start, end);
}
