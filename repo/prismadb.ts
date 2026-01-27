import { PrismaClient } from "../lib/prismaclient/client.ts";

export const db = new PrismaClient();

let shuttingDown = false;

/**
 * Register signal handlers to disconnect Prisma cleanly.
 */
export const setupShutdown = () => {
    /**
     * Disconnect Prisma on process signals.
     */
    const shutdown = async (signal: Deno.Signal) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.log(`Initiating graceful shutdown due to ${signal}...`);
        try {
            await db.$disconnect();
            console.log(`Prisma disconnected on ${signal}`);
        } catch (error) {
            console.error(`Prisma disconnect failed on ${signal}:`, error);
        }
    };

    Deno.addSignalListener("SIGINT", () => {
        void shutdown("SIGINT");
    });

    Deno.addSignalListener("SIGTERM", () => {
        void shutdown("SIGTERM");
    });
};

export default db;
