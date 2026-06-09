import type { UserType } from "./types.ts";
import type { RepoUserRecord } from "../repo/users.ts";

export function parseDisplayName(name: string): { firstname: string; lastname: string } {
    const firstSpace = name.indexOf(" ");
    if (firstSpace === -1) return { firstname: "", lastname: name };
    return {
        firstname: name.slice(firstSpace + 1),
        lastname: name.slice(0, firstSpace),
    };
}

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
