import type { UserType } from "./types.ts";
import type { RepoUserRecord } from "../repo/users.ts";

export function userRecordToUserType(user: RepoUserRecord): UserType {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        klasse: user.klasse ?? undefined,
    };
}

export function userTypeToDbInput(user: UserType) {
    return {
        email: user.email,
        name: user.name,
        klasse: user.klasse ?? null,
        updatedat: new Date(),
    };
}
