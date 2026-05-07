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
const sensitiveSettingKeys = new Set([
    'openlist_password',
    'cookie_115',
    'cookie_quark',
    'telegram_bot_token',
    'discord_bot_token'
]);
const encryptionKey = (() => {
    const raw = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET || process.env.JWT_SECRET || process.env.APP_SECRET || '';
    const isProd = process.env.NODE_ENV === 'production';
    let key: Buffer;
    if (raw) {
        if (/^[0-9a-fA-F]{64}$/.test(raw)) {
            key = Buffer.from(raw, 'hex');
        } else {
            const base64 = Buffer.from(raw, 'base64');
            key = base64.length === 32 ? base64 : crypto.createHash('sha256').update(raw).digest();
        }
    } else {
        if (isProd) {
            throw new Error('ENCRYPTION_KEY is required in production');
        }
        key = crypto.createHash('sha256').update(`horacemovie:${dbPath}`).digest();
        logger.warn('[Db] ENCRYPTION_KEY missing, using fallback');
    }
    if (key.length !== 32) {
        key = crypto.createHash('sha256').update(key).digest();
    }
    return key;
})();
const tokenSecret = (() => {
    const raw = process.env.TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET || '';
    if (!raw) {
        return encryptionKey;
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }
    const base64 = Buffer.from(raw, 'base64');
    return base64.length === 32 ? base64 : crypto.createHash('sha256').update(raw).digest();
})();

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

export const hashToken = (token: string) => {
    return crypto.createHmac('sha256', tokenSecret).update(token).digest('hex');
};

export const hashPassword = (password: string) => {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(password, salt, 64);
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
};

export const verifyPassword = (password: string, stored: string) => {
    if (!stored) return { valid: false };
    if (!stored.startsWith('scrypt$')) {
        return { valid: stored === password, needsUpgrade: stored === password };
    }
    const parts = stored.split('$');
    if (parts.length < 3) return { valid: false };
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length);
    const valid = crypto.timingSafeEqual(derived, expected);
    return { valid, needsUpgrade: false };
};

export const isSensitiveSettingKey = (key: string) => {
    return sensitiveSettingKeys.has(key);
};

export const encryptSettingValue = (key: string, value: string) => {
    if (!isSensitiveSettingKey(key)) return value;
    if (!value || value.startsWith('enc$')) return value;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc$${iv.toString('base64')}$${tag.toString('base64')}$${encrypted.toString('base64')}`;
};

export const decryptSettingValue = (key: string, value: string | null | undefined) => {
    if (!value || !isSensitiveSettingKey(key)) return value ?? '';
    if (!value.startsWith('enc$')) return value;
    const parts = value.split('$');
    if (parts.length < 4) return value;
    try {
        const iv = Buffer.from(parts[1], 'base64');
        const tag = Buffer.from(parts[2], 'base64');
        const data = Buffer.from(parts[3], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted.toString('utf8');
    } catch {
        return value;
    }
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

        CREATE TABLE IF NOT EXISTS user_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            expires_at DATETIME,
            created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);

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

    const notificationTargetsFixed = await db.get('SELECT value FROM settings WHERE key = "notification_targets"');
    if (!notificationTargetsFixed) {
        logger.info('[Db] Setting default notification_targets');
        await db.run(
            'INSERT INTO settings (key, value) VALUES (?, ?)',
            'notification_targets',
            JSON.stringify(['telegram_chat', 'discord_channel'])
        );
    }

    const users = await db.all('SELECT id, password, api_token, token_expires_at FROM users');
    for (const user of users) {
        if (user.password && typeof user.password === 'string' && !user.password.startsWith('scrypt$')) {
            const passwordHash = hashPassword(user.password);
            await db.run('UPDATE users SET password = ? WHERE id = ?', passwordHash, user.id);
        }
        if (user.api_token && typeof user.api_token === 'string' && !/^[0-9a-fA-F]{64}$/.test(user.api_token)) {
            const tokenHash = hashToken(user.api_token);
            await db.run('UPDATE users SET api_token = ? WHERE id = ?', tokenHash, user.id);
        }
    }
    for (const user of users) {
        if (user.api_token) {
            await db.run(
                'INSERT OR IGNORE INTO user_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
                user.id,
                user.api_token,
                user.token_expires_at
            );
        }
    }

    const sensitiveSettings = await db.all(
        'SELECT key, value FROM settings WHERE key IN ("openlist_password", "cookie_115", "cookie_quark", "telegram_bot_token", "discord_bot_token")'
    );
    for (const row of sensitiveSettings) {
        if (row.value && typeof row.value === 'string' && !row.value.startsWith('enc$')) {
            const encrypted = encryptSettingValue(row.key, row.value);
            await db.run('UPDATE settings SET value = ? WHERE key = ?', encrypted, row.key);
        }
    }

    // Create default admin if not exists
    const adminExists = await db.get('SELECT id FROM users WHERE role = ?', 'admin');
    if (!adminExists) {
        const randomPassword = crypto.randomBytes(6).toString('hex');
        const now = new Date().toLocaleString('sv-SE');
        const passwordHash = hashPassword(randomPassword);
        await db.run('INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)', 'admin', passwordHash, 'admin', now);
        logger.warn('[Db] Initial admin created', { username: 'admin' });
        console.log('************************************************');
        console.log('*                                              *');
        console.log('*   Initial Admin Created Successfully!        *');
        console.log('*   Username: admin                            *');
        console.log(`*   Password: ${randomPassword}                     *`);
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
