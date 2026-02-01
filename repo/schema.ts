import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    klasse: text("klasse"),
    updatedat: integer("updatedat", { mode: "timestamp" }).notNull(),
});

export const registrations = sqliteTable("registrations", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ip: text("ip").notNull(),
    userId: integer("userId")
        .notNull()
        .references(() => users.id, {
            onDelete: "restrict",
            onUpdate: "cascade",
        }),
    at: text("at").notNull(),
});

export const forensicRegistrations = sqliteTable("forensic_registrations", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ip: text("ip").notNull(),
    userId: integer("userId")
        .notNull()
        .references(() => users.id, {
            onDelete: "restrict",
            onUpdate: "cascade",
        }),
});

export const abgaben = sqliteTable("abgaben", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId")
        .notNull()
        .references(() => users.id, {
            onDelete: "restrict",
            onUpdate: "cascade",
        }),
    ip: text("ip").notNull(),
    filename: text("filename").notNull(),
    at: text("at").notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
    registrations: many(registrations),
    forensicRegistrations: many(forensicRegistrations),
    abgaben: many(abgaben),
}));

export const registrationsRelations = relations(registrations, ({ one }) => ({
    user: one(users, {
        fields: [registrations.userId],
        references: [users.id],
    }),
}));

export const forensicRegistrationsRelations = relations(
    forensicRegistrations,
    ({ one }) => ({
        user: one(users, {
            fields: [forensicRegistrations.userId],
            references: [users.id],
        }),
    }),
);

export const abgabenRelations = relations(abgaben, ({ one }) => ({
    user: one(users, {
        fields: [abgaben.userId],
        references: [users.id],
    }),
}));
