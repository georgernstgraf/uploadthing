import { assertEquals } from "@std/assert";
import { buildUserSearchFilter, escapeLdapFilterValue } from "./ldap_filter.ts";

Deno.test("buildUserSearchFilter - prüft Vorname, Nachname, Mail und Kontocode", () => {
    assertEquals(
        buildUserSearchFilter("Gra"),
        "(|(givenName=Gra*)(sn=Gra*)(mail=Gra*)(sAMAccountName=Gra*))",
    );
});

Deno.test("buildUserSearchFilter - schneidet Leerzeichen am Rand ab", () => {
    assertEquals(
        buildUserSearchFilter("  Haim  "),
        "(|(givenName=Haim*)(sn=Haim*)(mail=Haim*)(sAMAccountName=Haim*))",
    );
});

Deno.test("escapeLdapFilterValue - maskiert Filter-Syntax", () => {
    assertEquals(escapeLdapFilterValue("Graf*()\\"), "Graf\\2a\\28\\29\\5c");
});

Deno.test("buildUserSearchFilter - verhindert Filter-Injection", () => {
    // Ohne Maskierung würde `)(sn=*` die ODER-Gruppe verlassen und alle
    // Benutzer treffen; maskiert bleibt der Begriff ein Suchwert.
    assertEquals(
        buildUserSearchFilter("x)(sn=*"),
        "(|(givenName=x\\29\\28sn=\\2a*)(sn=x\\29\\28sn=\\2a*)(mail=x\\29\\28sn=\\2a*)(sAMAccountName=x\\29\\28sn=\\2a*))",
    );
});
