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
            created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS tracker_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            keyword TEXT,
            share_url TEXT,
            target_folder_id TEXT,
            pan_type TEXT, -- '115' or 'quark'
            last_file_ids TEXT, -- JSON array of file/folder IDs
            interval_value INTEGER DEFAULT 6,
            interval_unit TEXT DEFAULT 'hour',
            last_run_at DATETIME,
            last_run_status TEXT,
            last_run_message TEXT,
            status TEXT DEFAULT 'active', -- 'active', 'paused'
            config TEXT, -- JSON config for filters
            created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
        );
    `);

    // Add missing columns if they don't exist (for existing databases)
    const columns = await db.all('PRAGMA table_info(tracker_tasks)');
    const columnNames = columns.map(c => c.name);

    // Remove redundant target_folder_name if exists
    if (columnNames.includes('target_folder_name')) {
        console.log('[Db] Removing redundant column: tracker_tasks.target_folder_name');
        try {
            await db.exec('ALTER TABLE tracker_tasks DROP COLUMN target_folder_name');
        } catch (e) {
            console.warn('[Db] Failed to drop target_folder_name, it might be an older SQLite version');
        }
    }
    
    // Rename interval_hours to interval_value if it exists
    if (columnNames.includes('interval_hours') && !columnNames.includes('interval_value')) {
        console.log('[Db] Migrating tracker_tasks: interval_hours -> interval_value');
        try {
            await db.exec('ALTER TABLE tracker_tasks RENAME COLUMN interval_hours TO interval_value');
        } catch (e) {
            console.warn('[Db] Failed to rename interval_hours, trying manual migration');
            // Older SQLite fallback or handle error
        }
    }
    
    if (!columnNames.includes('interval_value') && !columnNames.includes('interval_hours')) {
        await db.exec('ALTER TABLE tracker_tasks ADD COLUMN interval_value INTEGER DEFAULT 6');
    }
    if (!columnNames.includes('target_folder_id')) {
        await db.exec('ALTER TABLE tracker_tasks ADD COLUMN target_folder_id TEXT');
    }
    if (!columnNames.includes('pan_type')) {
        await db.exec('ALTER TABLE tracker_tasks ADD COLUMN pan_type TEXT');
    }
    if (!columnNames.includes('last_file_ids')) {
            await db.exec('ALTER TABLE tracker_tasks ADD COLUMN last_file_ids TEXT');
        }
        if (!columnNames.includes('interval_unit')) {
            await db.exec('ALTER TABLE tracker_tasks ADD COLUMN interval_unit TEXT DEFAULT "hour"');
        }
    if (!columnNames.includes('last_run_status')) {
        await db.exec('ALTER TABLE tracker_tasks ADD COLUMN last_run_status TEXT');
    }
    if (!columnNames.includes('last_run_message')) {
        await db.exec('ALTER TABLE tracker_tasks ADD COLUMN last_run_message TEXT');
    }

    // Fix existing UTC times to local time (UTC+8) - One time migration
    const tzFixed = await db.get('SELECT value FROM settings WHERE key = "timezone_fixed"');
    if (!tzFixed) {
        console.log('[Db] Migrating existing UTC times to local time (UTC+8)...');
        try {
            await db.exec(`
                UPDATE tracker_tasks 
                SET created_at = datetime(created_at, '+8 hours')
                WHERE created_at IS NOT NULL;
                
                UPDATE tracker_tasks 
                SET last_run_at = datetime(last_run_at, '+8 hours')
                WHERE last_run_at IS NOT NULL;
                
                UPDATE users 
                SET created_at = datetime(created_at, '+8 hours')
                WHERE created_at IS NOT NULL;
                
                INSERT OR REPLACE INTO settings (key, value) VALUES ("timezone_fixed", "true");
            `);
            console.log('[Db] Timezone migration completed.');
        } catch (e: any) {
            console.warn('[Db] Timezone migration failed:', e.message);
        }
    }

    // Create default admin if not exists
    const adminExists = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
    if (!adminExists) {
        const randomPassword = crypto.randomBytes(6).toString('hex'); // 12位随机密码
        const now = new Date().toLocaleString('sv-SE');
        await db.run('INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)', 'admin', randomPassword, 'admin', now);
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
