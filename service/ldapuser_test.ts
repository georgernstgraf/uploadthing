import { assertEquals, assertRejects } from "@std/assert";
import { NoSuchObjectError } from "ldapts";
import type { LdapUserType } from "../lib/types.ts";
import { LdapTransportError } from "../repo/ldapuser.ts";
import {
    MAX_SEARCH_RESULTS,
    searchFailureMessage,
    searchLoginCandidates,
} from "./ldapuser.ts";
import type { LdapUserSearcher } from "./ldapuser.ts";

/**
 * #162: Die Namenssuche bekommt ihren Searcher injiziert — damit ist der
 * Fehlerzweig ohne echtes LDAP prüfbar, und die Meldung darf eine
 * Server-Antwort nicht als Ausfall erzählen.
 */

function ldapUser(overrides: Partial<LdapUserType>): LdapUserType {
    return {
        displayName: "Graf Georg",
        givenName: "Georg",
        sn: "Graf",
        mail: "georg.graf@htl-wien5.schule",
        sAMAccountName: "ggraf",
        physicalDeliveryOfficeName: "5AHIT",
        ...overrides,
    };
}

function rejectingSearcher(error: unknown): LdapUserSearcher {
    return () => Promise.reject(error);
}

function noObjectError(): NoSuchObjectError {
    return new NoSuchObjectError(
        "0000208D: NameErr: DSID-0310020A, problem 2001 (NO_OBJECT), data 0, best match of 'DC=htl-wien5,DC=schule'",
    );
}

Deno.test("Sucher ist injizierbar: Treffer werden wie bisher aufbereitet (#162)", async () => {
    const seen: string[] = [];
    const searcher: LdapUserSearcher = (term) => {
        seen.push(term);
        return Promise.resolve([
            ldapUser({ givenName: "Petra", sn: "Graf" }),
            ldapUser({ givenName: "Georg", mail: "georg.graf@htl-wien5.schule" }),
            // Technische Konten ohne Mail können sich nicht anmelden.
            ldapUser({ givenName: "Grafik", mail: "" }),
        ]);
    };

    const result = await searchLoginCandidates("  Graf  ", searcher);

    assertEquals(seen, ["Graf"]);
    assertEquals(result.users.map((u) => u.label), [
        "Georg Graf",
        "Petra Graf",
    ]);
    assertEquals(result.users[0].email, "georg.graf@htl-wien5.schule");
    assertEquals(result.has_more, false);
});

Deno.test("Trefferlimit der Suche bleibt unverändert (#162)", async () => {
    const searcher: LdapUserSearcher = () =>
        Promise.resolve(
            Array.from(
                { length: MAX_SEARCH_RESULTS + 1 },
                (_, index) =>
                    ldapUser({
                        givenName: `Person${index}`,
                        sn: "Graf",
                        mail: `person${index}@htl-wien5.schule`,
                    }),
            ),
        );

    const result = await searchLoginCandidates("Graf", searcher);

    assertEquals(result.users.length, MAX_SEARCH_RESULTS);
    assertEquals(result.has_more, true);
});

Deno.test("Server-Antwort wird nicht als Ausfall gemeldet (#162)", async () => {
    const failure = await assertRejects(
        () => searchLoginCandidates("Graf", rejectingSearcher(noObjectError())),
        NoSuchObjectError,
    );

    // Der Fehler kommt typisiert an — kein Reconnect im Repo, weil der
    // Suchpfad hier injiziert ist.
    assertEquals(failure.code, 32);

    const message = searchFailureMessage(failure);
    assertEquals(message.includes("nicht erreichbar"), false);
    assertEquals(message.includes("am Server gescheitert"), true);
    assertEquals(message.includes("0x20"), true);
    // Sprachregel: geduzt, nie gesiezt.
    assertEquals(message.includes("melde dich"), true);
});

Deno.test("Transportfehler bleibt „nicht erreichbar“ (#162)", () => {
    const message = searchFailureMessage(
        new LdapTransportError("read ECONNRESET"),
    );

    assertEquals(message.includes("nicht erreichbar"), true);
    assertEquals(message.includes("melde dich"), true);
});
