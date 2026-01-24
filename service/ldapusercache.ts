import { UserType } from "../lib/types.ts";
import * as repo from "../repo/repo.ts";
export async function registerUser(user: UserType) {
    await repo.ldapusercache.registerUser(user);
}
export async function registerManyUsers(users: UserType[]) {
    await repo.ldapusercache.registerManyUsers(users);
}
