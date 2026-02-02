import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/horacemovie.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database | null = null;

export async function initDb() {
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    console.log(`Connected to SQLite database at ${dbPath}`);

    // Initialize tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'guest',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS tracker_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            keyword TEXT NOT NULL,
            interval_hours INTEGER DEFAULT 6,
            last_run_at DATETIME,
            status TEXT DEFAULT 'active', -- 'active', 'paused'
            config TEXT, -- JSON config for filters
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

    `);

    // Create default admin if not exists
    const adminExists = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
    if (!adminExists) {
        const randomPassword = crypto.randomBytes(6).toString('hex'); // 12位随机密码
        await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 'admin', randomPassword, 'admin');
        console.log('************************************************');
        console.log('*                                              *');
        console.log('*   Initial Admin Created Successfully!        *');
        console.log(`*   Username: admin                            *`);
        console.log(`*   Password: ${randomPassword}                 *`);
        console.log('*                                              *');
        console.log('*   Please change this password after login.   *');
        console.log('************************************************');
    }

    return db;
}

export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDb first.');
    }
    return db;
}

export async function closeDb() {
    if (!db) return;
    await db.close();
    db = null;
}
