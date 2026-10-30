/**
 * MAC-Adressen (#147).
 *
 * Gespeichert und verglichen wird immer eine kanonische Schreibweise:
 * kleingeschrieben, sechs Oktette, mit Doppelpunkten getrennt
 * (`aa:bb:cc:dd:ee:ff`). Der MikroTik liefert die MAC in derselben Form,
 * Menschen tippen sie aber auch als `AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff`
 * oder `aabbccddeeff` ein — `normalizeMac()` bringt alles auf eine Form und
 * lehnt alles andere ab.
 */

const MAC_HEX_LENGTH = 12;

/**
 * Normalisiert eine MAC-Adresse auf `aa:bb:cc:dd:ee:ff`.
 *
 * Erlaubte Eingaben: Hex-Ziffern mit `:`, `-`, `.` oder Leerzeichen als
 * Trenner, in beliebiger Groß-/Kleinschreibung. Alles, was danach nicht
 * genau 12 Hex-Ziffern ergibt, ist keine MAC-Adresse und liefert `null`.
 */
export function normalizeMac(raw: string): string | null {
    const compact = raw.trim().toLowerCase().replace(/[\s:.-]/g, "");
    if (compact.length !== MAC_HEX_LENGTH || !/^[0-9a-f]+$/.test(compact)) {
        return null;
    }

    const octets: string[] = [];
    for (let index = 0; index < MAC_HEX_LENGTH; index += 2) {
        octets.push(compact.slice(index, index + 2));
    }
    return octets.join(":");
}
