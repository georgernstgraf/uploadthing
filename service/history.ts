import { IPHistory } from "../lib/types.ts";
import * as repo from "../repo/repo.ts";
export function ofIP(ip: string): IPHistory {
    return repo.history.getHistoryForIP(ip);
}
