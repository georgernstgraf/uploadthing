/**
 * Stabile Bezeichner für IP-Kärtchen (#163).
 *
 * `id`, SSE-Eventname und HTMX-Trigger eines Kärtchens müssen aus
 * **einer** Quelle kommen: sonst hört das Kärtchen nach der ersten
 * Umbenennung auf einen anderen Event als der Server schickt. Punkte
 * sind in CSS-Selektoren und Eventnamen unhandlich, deshalb werden sie
 * zu Bindestrichen: `192.168.21.5` → `192-168-21-5`.
 */
export function ipSlug(ip: string): string {
    return ip.replaceAll(".", "-");
}
