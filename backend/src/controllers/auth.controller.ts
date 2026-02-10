import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { getDb, revokeAuthToken, setCachedAuthUser } from '../db/index.js';

const createToken = () => randomBytes(24).toString('hex');
const createTokenPayload = () => {
    const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return {
        token: createToken(),
        expiresAt: new Date(expiresAtMs).toLocaleString('sv-SE'),
        expiresAtMs
    };
};
const getRequestToken = (req: Request) => {
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const headerToken = typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'] : '';
    return bearerToken || headerToken;
};

export const login = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const db = getDb();

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ? AND password = ?', username, password);
        if (user) {
            const { token, expiresAt, expiresAtMs } = createTokenPayload();
            await db.run('UPDATE users SET api_token = ?, token_expires_at = ? WHERE id = ?', token, expiresAt, user.id);
            setCachedAuthUser(token, { id: user.id, username: user.username, role: user.role }, expiresAtMs);
            res.json({
                id: user.id,
                username: user.username,
                role: user.role,
                token,
                token_expires_at: expiresAt
            });
        } else {
            res.status(401).json({ error: '用户名或密码错误' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const logout = async (req: Request, res: Response) => {
    const db = getDb();
    const authUser = (req as any).user;
    if (!authUser) {
        return res.status(401).json({ error: '未登录' });
    }
    const token = getRequestToken(req);
    if (!token) {
        return res.status(401).json({ error: '未登录' });
    }
    try {
        await db.run('UPDATE users SET api_token = NULL, token_expires_at = NULL WHERE id = ? AND api_token = ?', authUser.id, token);
        revokeAuthToken(token);
        res.json({ message: '已退出登录' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    const db = getDb();
    const authUser = (req as any).user;
    if (!authUser) {
        return res.status(401).json({ error: '未登录' });
    }
    const token = getRequestToken(req);
    if (!token) {
        return res.status(401).json({ error: '未登录' });
    }
    const { token: newToken, expiresAt, expiresAtMs } = createTokenPayload();
    try {
        const result = await db.run(
            'UPDATE users SET api_token = ?, token_expires_at = ? WHERE id = ? AND api_token = ?',
            newToken,
            expiresAt,
            authUser.id,
            token
        );
        if (!result || result.changes === 0) {
            return res.status(401).json({ error: '登录已过期' });
        }
        revokeAuthToken(token);
        setCachedAuthUser(newToken, { id: authUser.id, username: authUser.username, role: authUser.role }, expiresAtMs);
        res.json({
            id: authUser.id,
            username: authUser.username,
            role: authUser.role,
            token: newToken,
            token_expires_at: expiresAt
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    const db = getDb();
    const authUser = (req as any).user;
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
    }
    try {
        const users = await db.all('SELECT id, username, role, created_at FROM users');
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { username, password, role } = req.body;
    const db = getDb();
    const authUser = (req as any).user;
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
    }

    try {
        const now = new Date().toLocaleString('sv-SE');
        await db.run('INSERT INTO users (username, password, role, created_at) VALUES (?, ?, ?, ?)', username, password, role || 'guest', now);
        res.json({ message: '用户创建成功' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    const authUser = (req as any).user;
    if (!authUser || authUser.role !== 'admin') {
        return res.status(403).json({ error: '无权限' });
    }

    try {
        await db.run('DELETE FROM users WHERE id = ?', id);
        res.json({ message: '用户已删除' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateMe = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const db = getDb();
    const authUser = (req as any).user;
    if (!authUser) {
        return res.status(401).json({ error: '未登录' });
    }

    try {
        if (password) {
            await db.run('UPDATE users SET username = ?, password = ? WHERE id = ?', username, password, authUser.id);
        } else {
            await db.run('UPDATE users SET username = ? WHERE id = ?', username, authUser.id);
        }
        res.json({ message: '个人信息已更新' });
    } catch (error: any) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        res.status(500).json({ error: error.message });
    }
};
