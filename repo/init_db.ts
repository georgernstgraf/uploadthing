import { db } from "./db.ts";

/**
 * Initialize database schema - creates tables if they don't exist.
 * Called at server startup to ensure all required tables exist.
 */
export function initDatabase(): void {
    console.log("Initializing database schema...");

    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            klasse TEXT,
            updatedat DATETIME NOT NULL
        )
    `);
    console.log("✓ users table ready");

    // IP fact table (tracks IP addresses seen)
    db.exec(`
        CREATE TABLE IF NOT EXISTS ipfact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            seen DATETIME NOT NULL,
            UNIQUE(ip, seen)
        )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_ipfact_ip ON ipfact(ip)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_ipfact_seen ON ipfact(seen)");
    console.log("✓ ipfact table ready");

    // Registrations table (current exam registrations)
    db.exec(`
        CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            userId INTEGER NOT NULL,
            at DATETIME NOT NULL
        )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_registrations_userId ON registrations(userId)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_registrations_ip ON registrations(ip)");
    console.log("✓ registrations table ready");

    // Forensic registrations table (archived/historical registrations)
    db.exec(`
        CREATE TABLE IF NOT EXISTS forensic_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            userId INTEGER NOT NULL,
            at DATETIME NOT NULL
        )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_forensic_userId ON forensic_registrations(userId)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_forensic_ip ON forensic_registrations(ip)");
    console.log("✓ forensic_registrations table ready");

    // Abgaben table (submissions)
    db.exec(`
        CREATE TABLE IF NOT EXISTS abgaben (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            ip TEXT NOT NULL,
            filename TEXT NOT NULL,
            at DATETIME NOT NULL
        )
    `);
    db.exec("CREATE INDEX IF NOT EXISTS idx_abgaben_userId ON abgaben(userId)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_abgaben_at ON abgaben(at)");
    console.log("✓ abgaben table ready");

    console.log("Database initialization complete!");
}

export default initDatabase;
