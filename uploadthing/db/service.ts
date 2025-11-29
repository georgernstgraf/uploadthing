import { PrismaClient } from "../generated/prisma/client.ts";

export const prisma = new PrismaClient();

export async function getIPUser(ip: string) {
  return await prisma.ip.findUnique({
    where: {
      ip,
    },
    select: {
      name: true,
    },
  });
}
export async function upsertIPUser(ip: string, name: string) {
  return await prisma.ip.upsert({
    where: {
      ip,
    },
    update: {
      name,
    },
    create: {
      ip,
      name,
    },
  });
}
