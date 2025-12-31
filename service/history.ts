import { IPHistoryRecord } from "../lib/types.ts";
import { localDateTimeString } from "../lib/timefunc.ts";
import * as repo from "../repo/repo.ts";
export function ofIP(ip: string): IPHistoryRecord[] {
    const res = repo.history.getHistoryForIP(ip);
    res.forEach((r) => {
        r.at = localDateTimeString(new Date(r.at));
    });
    return res;
}
