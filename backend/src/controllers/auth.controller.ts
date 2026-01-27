import { Request, Response } from 'express';
import { getDb } from '../db/index.js';

export const login = async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const db = getDb();

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ? AND password = ?', username, password);
        if (user) {
            // In a real app, generate JWT. For now, simple user object
            res.json({
                id: user.id,
                username: user.username,
                role: user.role
            });
        } else {
            res.status(401).json({ error: '用户名或密码错误' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getUsers = async (req: Request, res: Response) => {
    const db = getDb();
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

    try {
        await db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', username, password, role || 'guest');
        res.json({ message: '用户创建成功' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();

    try {
        await db.run('DELETE FROM users WHERE id = ?', id);
        res.json({ message: '用户已删除' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
