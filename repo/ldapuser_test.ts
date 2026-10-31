import { assertEquals, assertRejects } from "@std/assert";
import { InvalidCredentialsError, NoSuchObjectError } from "ldapts";
import {
    LdapServerResponseError,
    LdapTransportError,
    ldapResultCode,
    retryOnceOnTransportError,
    toLdapSearchError,
} from "./ldapuser.ts";

/**
 * #162: Eine Server-Antwort des AD (`NO_OBJECT`) wurde als Ausfall
 * erzählt und löste einen Reconnect aus. Diese Tests belegen die
 * Klassifizierung und den begrenzten Retry, ohne echtes LDAP: die
 * ldapts-Fehlerklassen sind echt, der Sucher ist ein Double.
 */

/** So sieht der Fehler aus, den das AD am 2026-10-31 geliefert hat. */
function noObjectError(): NoSuchObjectError {
    return new NoSuchObjectError(
        "0000208D: NameErr: DSID-0310020A, problem 2001 (NO_OBJECT), data 0, best match of 'DC=htl-wien5,DC=schule'",
    );
}

/** Ein reiner Socket-Fehler, wie ihn ein abgerissener Client wirft. */
function resetError(): Error {
    return Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
}

Deno.test("ldapts-Result-Code hängt als numerischer `code` am Fehler (#162)", () => {
    const noObject = noObjectError();

    // Beleg für die Annahme im Produktivcode: numerischer `code` = 32/0x20.
    assertEquals(noObject.code, 32);
    assertEquals(noObject.constructor.name, "NoSuchObjectError");
    assertEquals(noObject.message.endsWith("Code: 0x20"), true);
    assertEquals(ldapResultCode(noObject), 32);

    assertEquals(new InvalidCredentialsError().code, 49);

    // Transportfehler tragen keinen numerischen Code.
    assertEquals(ldapResultCode(resetError()), null);
    assertEquals(ldapResultCode(new Error("Connection timeout")), null);
});

Deno.test("Fehler werden in Server-Antwort und Transportfehler getrennt (#162)", () => {
    const server = toLdapSearchError(noObjectError());
    assertEquals(server.kind, "server");
    assertEquals(server instanceof LdapServerResponseError, true);
    assertEquals((server as LdapServerResponseError).code, 32);

    const transport = toLdapSearchError(resetError());
    assertEquals(transport.kind, "transport");
    assertEquals(transport instanceof LdapTransportError, true);

    // Bereits typisierte Fehler bleiben unverändert.
    assertEquals(toLdapSearchError(server), server);
    assertEquals(toLdapSearchError(transport), transport);
});

Deno.test("Server-Antwort löst keinen Reconnect aus (#162)", async () => {
    let attempts = 0;
    let reconnects = 0;

    const failure = await assertRejects(
        () =>
            retryOnceOnTransportError(
                () => {
                    attempts++;
                    return Promise.reject(noObjectError());
                },
                () => {
                    reconnects++;
                    return Promise.resolve();
                },
            ),
        LdapServerResponseError,
    );

    assertEquals(attempts, 1, "kein zweiter Suchversuch");
    assertEquals(reconnects, 0, "kein Reconnect bei einer Server-Antwort");
    assertEquals(failure.code, 32);
});

Deno.test("Transportfehler bekommen genau einen Neuversuch (#162)", async () => {
    let attempts = 0;
    let reconnects = 0;

    const result = await retryOnceOnTransportError(
        () => {
            attempts++;
            if (attempts === 1) {
                return Promise.reject(resetError());
            }
            return Promise.resolve(["treffer"]);
        },
        () => {
            reconnects++;
            return Promise.resolve();
        },
    );

    assertEquals(attempts, 2, "erster Versuch plus genau ein Retry");
    assertEquals(reconnects, 1);
    assertEquals(result, ["treffer"]);
});

Deno.test("zwei Transportfehler enden als typisierter Fehler (#162)", async () => {
    let attempts = 0;
    let reconnects = 0;

    const failure = await assertRejects(
        () =>
            retryOnceOnTransportError(
                () => {
                    attempts++;
                    return Promise.reject(resetError());
                },
                () => {
                    reconnects++;
                    return Promise.resolve();
                },
            ),
        LdapTransportError,
    );

    assertEquals(attempts, 2);
    assertEquals(reconnects, 1);
    assertEquals(failure.kind, "transport");
    assertEquals(failure.message.includes("ECONNRESET"), true);
});

Deno.test("gescheiterter Reconnect wird als Transportfehler gemeldet (#162)", async () => {
    const failure = await assertRejects(
        () =>
            retryOnceOnTransportError(
                () => Promise.reject(resetError()),
                () => Promise.reject(new Error("Connection timeout")),
            ),
        LdapTransportError,
    );

    assertEquals(failure.kind, "transport");
});
