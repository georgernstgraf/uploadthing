import { UserType } from "../lib/types.ts";
import prisma from "./prismadb.ts";

export async function registerUser(user: UserType) {
    await prisma.ldapusercache.upsert({
        where: { email: user.email },
        update: {
            name: user.name,
            klasse: user.klasse,
            updatedat: new Date(),
        },
        create: {
            email: user.email,
            name: user.name,
            klasse: user.klasse,
            updatedat: new Date(),
        },
    });
}
export async function registerManyUsers(users: UserType[]) {
    const operations = users.map((user) =>
        prisma.ldapusercache.upsert({
            where: { email: user.email },
            update: {
                name: user.name,
                klasse: user.klasse,
                updatedat: new Date(),
            },
            create: {
                email: user.email,
                name: user.name,
                klasse: user.klasse,
                updatedat: new Date(),
            },
        })
    );
    await prisma.$transaction(operations);
}
