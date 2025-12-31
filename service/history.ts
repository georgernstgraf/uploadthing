import { IPHistoryRecord, UserHistoryRecord } from "../lib/types.ts";
import { localDateTimeString } from "../lib/timefunc.ts";
import * as repo from "../repo/repo.ts";
export function ofIP(ip: string): IPHistoryRecord[] {
    const res = repo.history.getHistoryForIP(ip);
    res.forEach((r) => {
        r.at = localDateTimeString(new Date(r.at));
    });
    return res;
}
export function ofEmail(): Map<string, UserHistoryRecord[]> {
    const res = new Map<string, UserHistoryRecord[]>();
    const all_emails = repo.history.allEmailFromHistory();
    const ret = new Map<string, UserHistoryRecord[]>();
    for (const email of all_emails) {
        const records = repo.history.historyOfEmail(email); // careful, repo has utc timestrings
        records.forEach((r) => {
            r.at = localDateTimeString(new Date(r.at));
        });
        ret.set(email, records);
    }
    return ret;
}
