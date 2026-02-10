import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { logger } from '../logger.js';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/horacemovie.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database | null = null;
const authCacheTtlMs = 60 * 1000;
const authCache = new Map<string, { user: { id: number; username: string; role: string }; expiresAtMs: number; cacheUntilMs: number }>();

export const getCachedAuthUser = (token: string) => {
    const cached = authCache.get(token);
    if (!cached) return null;
    const now = Date.now();
    if (now > cached.cacheUntilMs || now > cached.expiresAtMs) {
        authCache.delete(token);
        return null;
    }
    return cached.user;
};

export const setCachedAuthUser = (token: string, user: { id: number; username: string; role: string }, expiresAtMs: number | null) => {
    const now = Date.now();
    const effectiveExpiresAtMs = typeof expiresAtMs === 'number' ? expiresAtMs : now + authCacheTtlMs;
    const cacheUntilMs = Math.min(now + authCacheTtlMs, effectiveExpiresAtMs);
    authCache.set(token, { user, expiresAtMs: effectiveExpiresAtMs, cacheUntilMs });
};

export const revokeAuthToken = (token: string) => {
    authCache.delete(token);
};

export async function initDb() {
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    logger.info('[Db] Connected to SQLite database', { dbPath });

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
    const userColumns = await db.all('PRAGMA table_info(users)');
    const userColumnNames = userColumns.map(c => c.name);

    // Remove redundant target_folder_name if exists
    if (columnNames.includes('target_folder_name')) {
        logger.info('[Db] Removing redundant column', { column: 'tracker_tasks.target_folder_name' });
        try {
            await db.exec('ALTER TABLE tracker_tasks DROP COLUMN target_folder_name');
        } catch (e) {
            logger.warn('[Db] Failed to drop target_folder_name', { error: e });
        }
    }
    
    // Rename interval_hours to interval_value if it exists
    if (columnNames.includes('interval_hours') && !columnNames.includes('interval_value')) {
        logger.info('[Db] Migrating tracker_tasks interval_hours -> interval_value');
        try {
            await db.exec('ALTER TABLE tracker_tasks RENAME COLUMN interval_hours TO interval_value');
        } catch (e) {
            logger.warn('[Db] Failed to rename interval_hours', { error: e });
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
    if (!userColumnNames.includes('api_token')) {
        await db.exec('ALTER TABLE users ADD COLUMN api_token TEXT');
    }
    if (!userColumnNames.includes('token_expires_at')) {
        await db.exec('ALTER TABLE users ADD COLUMN token_expires_at DATETIME');
    }

    // Fix existing UTC times to local time (UTC+8) - One time migration
    const tzFixed = await db.get('SELECT value FROM settings WHERE key = "timezone_fixed"');
    if (!tzFixed) {
        logger.info('[Db] Migrating existing UTC times to local time (UTC+8)');
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
            logger.info('[Db] Timezone migration completed');
        } catch (e: any) {
            logger.warn('[Db] Timezone migration failed', { error: e });
        }
    }

    // Create default admin if not exists
    const adminExists = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
    if (!adminExists) {
        const randomPassword = crypto.randomBytes(6).toString('hex'); // 12位随机密码
        const now = new Date().toLocaleString('sv-SE');
        await db.run('INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)', 'admin', randomPassword, 'admin', now);
        logger.warn('[Db] Initial admin created', { username: 'admin' });
        console.log('************************************************');
        console.log('*                                              *');
        console.log('*   Initial Admin Created Successfully!        *');
        console.log('*   Username: admin                            *');
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
