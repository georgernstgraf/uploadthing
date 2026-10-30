/**
 * Drizzle-Schema — Schema- und Migrationsautorität des Projekts (seit #133).
 *
 * Es bildet exakt den Ist-Zustand von `prisma/schema.prisma` (Stand vor dem
 * Umstieg) ab, damit die Baseline-Migration keine Schemaänderung ist:
 *
 * - Tabellen: `users`, `ipfact`, `cookiepresents`, `registrations`,
 *   `abgaben`, `examstate`, `adminmac`
 * - Alle Indizes und Unique-Constraints mit den historisch gewachsenen
 *   Namen — die Forensik-Hot-Queries hängen an
 *   `cookiepresents(ip, at)`, `registrations(ip, at)`, `abgaben(ip, at)`
 *   und `ipfact(seen, ip)` (siehe `docs/ai/PITFALLS.md`).
 *
 * Das Schema wird **nicht** zur Laufzeit benutzt: die Repositories bleiben
 * bei handgeschriebenem SQL über `@db/sqlite` (drizzle-orm 0.45 hat keinen
 * `@db/sqlite`-Adapter). Es dient `drizzle-kit generate` als Quelle für
 * Migrationen.
 */

import { sql } from "drizzle-orm";
import {
    customType,
    foreignKey,
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Zeitstempel werden von den Repositories als UTC-ISO-Strings geschrieben
 * (`date.toISOString()`), die Spalten heißen in der Datenbank aber
 * `DATETIME`. Der Custom-Type erhält den deklarierten Spaltentyp, damit
 * generierte Migrationen byte-gleich zum bestehenden Schema bleiben.
 */
const datetime = customType<{ data: string; driverData: string }>({
    dataType: () => "DATETIME",
});

export const users = sqliteTable(
    "users",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        email: text("email").notNull(),
        name: text("name").notNull(),
        klasse: text("klasse"),
        updatedat: datetime("updatedat").notNull(),
    },
    (table) => [uniqueIndex("users_email_key").on(table.email)],
);

export const ipfact = sqliteTable(
    "ipfact",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        ip: text("ip").notNull(),
        seen: datetime("seen").notNull(),
        /**
         * MAC-Adresse des Geräts zum Zeitpunkt der Sichtung (#145).
         * Nullable: ältere Zeilen und Clients ohne lesbare MAC bleiben gültig.
         */
        mac: text("mac"),
    },
    (table) => [
        uniqueIndex("ipfact_ip_seen_key").on(table.ip, table.seen),
        index("ipfact_seen_ip_idx").on(table.seen, table.ip),
    ],
);

export const registrations = sqliteTable(
    "registrations",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        ip: text("ip").notNull(),
        at: datetime("at").notNull().default(sql`CURRENT_TIMESTAMP`),
        userId: integer("userId").notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "registrations_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        index("registrations_userId_idx").on(table.userId),
        index("registrations_ip_at_idx").on(table.ip, table.at),
    ],
);

export const cookiepresents = sqliteTable(
    "cookiepresents",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        ip: text("ip").notNull(),
        at: datetime("at").notNull().default(sql`CURRENT_TIMESTAMP`),
        userId: integer("userId").notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "cookiepresents_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        index("cookiepresents_userId_idx").on(table.userId),
        index("cookiepresents_ip_at_idx").on(table.ip, table.at),
    ],
);

export const abgaben = sqliteTable(
    "abgaben",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        userId: integer("userId").notNull(),
        ip: text("ip").notNull(),
        filename: text("filename").notNull(),
        at: datetime("at").notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
            name: "abgaben_userId_fkey",
        })
            .onUpdate("cascade")
            .onDelete("restrict"),
        index("abgaben_userId_idx").on(table.userId),
        index("abgaben_at_idx").on(table.at),
        index("abgaben_ip_at_idx").on(table.ip, table.at),
    ],
);

/**
 * Freigegebene Geräte für die Lehrpersonen-Anmeldung (#147).
 *
 * Eine MAC-Adresse ist der natürliche Schlüssel des Eintrags; sie wird
 * kanonisch (`aa:bb:cc:dd:ee:ff`) gespeichert und ist deshalb eindeutig.
 * `comment` hält fest, welches Gerät gemeint ist („grg-usblan").
 *
 * Die Freigabe ist eine Zusatzbedingung zur LDAP-Klasse `LehrendeR`, keine
 * Rolle: eine freigegebene MAC macht niemanden zum Admin. MAC-Spoofing ist
 * trivial, die Liste ist Komfort, keine Sicherheitsgrenze.
 */
export const adminmac = sqliteTable(
    "adminmac",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        mac: text("mac").notNull(),
        comment: text("comment").notNull(),
        created_at: datetime("created_at").notNull(),
    },
    (table) => [uniqueIndex("adminmac_mac_key").on(table.mac)],
);

/**
 * Singleton: immer genau eine Zeile mit id = 1.
 *
 * Der Ist-Zustand der Datenbank ist `PRIMARY KEY AUTOINCREMENT` (so hat
 * Prisma die Tabelle angelegt), obwohl das frühere Prisma-Modell `@id`
 * ohne Autoincrement deklarierte. Maßgeblich ist die reale Datenbank.
 */
export const examstate = sqliteTable("examstate", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    status: text("status").notNull(),
    duration_seconds: integer("duration_seconds").notNull(),
    started_at: datetime("started_at"),
    paused_seconds: integer("paused_seconds").notNull(),
    extra_seconds: integer("extra_seconds").notNull(),
    updated_at: datetime("updated_at").notNull(),
});
