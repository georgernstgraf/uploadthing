import type { BindParameters, Statement } from "@db/sqlite";
import type { AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import db from "./db.ts";
import * as schema from "./schema.ts";

const remote: AsyncRemoteCallback = (
    sql: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get",
) => {
    const boundParams = params as BindParameters;
    const stmt: Statement = db.prepare(sql);
    if (method === "all" || method === "values") {
        const rows = stmt.values(boundParams) as unknown[][];
        return Promise.resolve({ rows });
    }
    if (method === "get") {
        const row = stmt.value(boundParams) as unknown[] | undefined;
        return Promise.resolve({ rows: row ? [row] : [] });
    }
    stmt.run(boundParams);
    return Promise.resolve({ rows: [] });
};

export const drizzleDb = drizzle(remote, {
    schema,
});
