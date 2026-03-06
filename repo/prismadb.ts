import { PrismaClient } from "../lib/prismaclient/client.ts";

export const db = new PrismaClient();

let shuttingDown = false;

export const shutdownPrisma = async (signal: Deno.Signal) => {
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

export default db;
