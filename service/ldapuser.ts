import * as repo from "../repo/repo.ts";

export async function getUserByEmail(startstring: string) {
  if (startstring.length < 3) {
    throw new Error("startstring must be at least 3 characters");
  }
  const result = await repo.ldap.getUsersStartingWith(startstring);
  return result.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    })
  );
}
export async function unbind_client() {
  await repo.ldap.serviceClientCarrier.client.unbind();
}
