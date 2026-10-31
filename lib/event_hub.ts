/**
 * Prozesslokaler Pub/Sub-Bus (#161).
 *
 * Bewusst ohne Fachkenntnis: der Bus kennt nur Kanäle, einen monotonen
 * Zähler je Kanal und Listener. Es gibt **kein Event-Log** — `publish`
 * liefert nur die laufende Nummer zurück, damit ein beim Senden
 * gebauter Snapshot sagen kann, auf welchem Stand er entstanden ist.
 * Die Wahrheit liegt in der Datenbank bzw. beim Aufrufer.
 *
 * `publish` ist synchron und awaitet nichts: ein Kanal mit vielen
 * Listenern darf einen Request nicht aufhalten. Listener laufen über
 * eine Kopie der Liste, damit sich ein Listener während des Versands
 * abmelden kann; ein werfender Listener wird geloggt und bricht die
 * übrigen nicht ab.
 */

export type HubEvent<T = unknown> = {
    channel: string;
    /** Monoton je Kanal, beginnt bei 1. */
    seq: number;
    payload: T;
};

export type HubListener<T = unknown> = (event: HubEvent<T>) => void;

type StoredListener = (event: HubEvent<unknown>) => void;

type ChannelState = {
    seq: number;
    listeners: Set<StoredListener>;
};

const channels = new Map<string, ChannelState>();

function channel(name: string): ChannelState {
    let state = channels.get(name);
    if (!state) {
        state = { seq: 0, listeners: new Set() };
        channels.set(name, state);
    }
    return state;
}

/**
 * Meldet ein Ereignis auf `name` und gibt die laufende Nummer des
 * Kanals zurück. Der Rückgabewert ist unabhängig davon, ob jemand
 * zuhört.
 */
export function publish<T>(name: string, payload: T): number {
    const state = channel(name);
    const seq = ++state.seq;
    const event: HubEvent<T> = { channel: name, seq, payload };

    // Kopie: Abmelden während `publish` verändert nur das Original.
    for (const listener of [...state.listeners]) {
        try {
            listener(event);
        } catch (error) {
            console.error(
                `Ereignis-Listener auf Kanal "${name}" ist gescheitert:`,
                error,
            );
        }
    }

    return seq;
}

/** Hört auf einem Kanal zu; die Rückgabe meldet ab (idempotent). */
export function subscribe<T>(
    name: string,
    listener: HubListener<T>,
): () => void {
    const state = channel(name);
    const stored: StoredListener = (event) => listener(event as HubEvent<T>);
    state.listeners.add(stored);
    return () => {
        state.listeners.delete(stored);
    };
}

/** Anzahl der Listener auf einem Kanal (0, wenn es ihn nicht gibt). */
export function size(name: string): number {
    return channels.get(name)?.listeners.size ?? 0;
}

/** Zuletzt vergebene Sequenz eines Kanals (0, wenn noch nichts lief). */
export function currentSeq(name: string): number {
    return channels.get(name)?.seq ?? 0;
}

/**
 * Setzt den Modulzustand zurück. Nur für Tests gedacht — Tests laufen
 * im selben Prozess und dürfen keine Listener aus einem früheren Fall
 * erben.
 */
export function resetHub(): void {
    channels.clear();
}
