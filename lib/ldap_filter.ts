/**
 * LDAP-Suchfilter für die Anmeldung über den Namen (#146).
 *
 * Schüler kennen ihren Kontocode nicht, aber ihren Namen. Deshalb wird
 * ein einziger Suchbegriff gegen Vorname, Nachname, Mail und
 * Kontocode geprüft — die Mail bleibt als Kriterium, weil einzelne
 * Personen ihren Code auswendig wissen.
 */

/**
 * Maskiert einen Suchbegriff nach RFC 4515, damit `*`, `(`, `)` und `\`
 * nicht als Filter-Syntax wirken (und `)` keine Filter-Injection erlaubt).
 */
export function escapeLdapFilterValue(value: string): string {
    return value
        .replace(/\\/g, "\\5c")
        .replace(/\*/g, "\\2a")
        .replace(/\(/g, "\\28")
        .replace(/\)/g, "\\29")
        .replace(/\0/g, "\\00");
}

/**
 * Filter für einen Namensteil oder Kontocode-Anfang.
 * Ein Treffer genügt, deshalb ist der Filter eine ODER-Verknüpfung.
 */
export function buildUserSearchFilter(term: string): string {
    const value = escapeLdapFilterValue(term.trim());
    return `(|(givenName=${value}*)(sn=${value}*)(mail=${value}*)(sAMAccountName=${value}*))`;
}
