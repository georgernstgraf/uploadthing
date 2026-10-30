import config from "../../lib/config.ts";
import type { OpnsenseConfig } from "../../lib/config.ts";
import type { ExamModeRunner } from "../../service/opnsense.ts";

/**
 * Fixtures für die OPNsense-API. Kein Test spricht die echte Firewall
 * an: `fakeFirewall` bildet Lesen, `toggleRule` und `apply` in-memory
 * nach, `withOpnsenseConfig` setzt (und restauriert) die Konfiguration.
 */

export const TEST_RULE_UUID = "e3e720e6-27fb-4565-b8cf-3a73cf682b54";
export const TEST_RULE_UUID_LEGACY = "e3e720e627fb4565b8cf3a73cf682b54";

export const TEST_OPNSENSE_CONFIG: OpnsenseConfig = {
    apiUrl: "https://firewall.test:8443",
    apiKey: "test-key",
    apiSecret: "test-secret",
    ruleUuid: TEST_RULE_UUID,
};

export type FakeCall = {
    url: string;
    method: string;
    authorization: string | null;
};

export type FakeFirewall = {
    runner: ExamModeRunner;
    calls: FakeCall[];
    isEnabled: () => boolean;
};

export type FakeFirewallOptions = {
    /** Zustand der Sperrregel vor dem Test. */
    enabled: boolean;
    searchStatus?: number;
    toggleStatus?: number;
    applyStatus?: number;
    /** false = toggleRule antwortet 200, ändert aber nichts (silent no-op). */
    toggleChangesState?: boolean;
};

export function fakeFirewall(options: FakeFirewallOptions): FakeFirewall {
    const calls: FakeCall[] = [];
    let enabled = options.enabled;

    const runner: ExamModeRunner = (url, init) => {
        const headers = new Headers(init?.headers);
        calls.push({
            url,
            method: init?.method ?? "GET",
            authorization: headers.get("Authorization"),
        });

        if (url.endsWith("/api/firewall/filter/searchRule")) {
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        total: 1,
                        rowCount: 1,
                        current: 1,
                        rows: [{ uuid: TEST_RULE_UUID_LEGACY, enabled: enabled ? "1" : "0" }],
                    }),
                    { status: options.searchStatus ?? 200 },
                ),
            );
        }

        if (url.includes("/api/firewall/filter/toggleRule/")) {
            const status = options.toggleStatus ?? 200;
            if (status === 200 && options.toggleChangesState !== false) {
                enabled = !enabled;
            }
            return Promise.resolve(new Response("{}", { status }));
        }

        if (url.endsWith("/api/firewall/filter/apply")) {
            return Promise.resolve(
                new Response("{}", { status: options.applyStatus ?? 200 }),
            );
        }

        return Promise.resolve(new Response("nicht erwartet", { status: 500 }));
    };

    return {
        runner,
        calls,
        isEnabled: () => enabled,
    };
}

export function withOpnsenseConfig<T>(
    opnsense: OpnsenseConfig | null,
    fn: () => Promise<T>,
): Promise<T> {
    const original = config.OPNSENSE;
    config.OPNSENSE = opnsense;
    return fn().finally(() => {
        config.OPNSENSE = original;
    });
}
