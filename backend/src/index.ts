import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import 'express-async-errors';
import { closeDb, initDb, getDb, getCachedAuthUser, setCachedAuthUser, hashToken } from './db/index.js';
import doubanRoutes from './routes/douban.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import searchRoutes from './routes/search.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import authRoutes from './routes/auth.routes.js';
import trackerRoutes from './routes/tracker.routes.js';
import taskRoutes from './routes/task.routes.js';
import { TrackerService } from './services/tracker.service.js';
import { TelegramService } from './services/telegram.service.js';
import { DiscordService } from './services/discord.service.js';
import { logger } from './logger.js';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';

dotenv.config();

const app = express();
const port = process.env.PORT || 8008;

// Middlewares
app.use((req, _res, next) => {
    (req as any).requestId = randomUUID();
    next();
});
app.use(helmet({
    contentSecurityPolicy: false, // For easier dev, adjust for prod
}));
app.use(cors());
morgan.token('requestId', (req) => (req as any).requestId || '-');
const isDev = process.argv[1]?.endsWith('.ts') || process.env.NODE_ENV !== 'production';
const morganFormat = isDev
    ? '[:date[iso]] :method :url :status :response-time ms - :res[content-length] reqId=:requestId'
    : '[:date[iso]] :method :url :status :response-time ms - :res[content-length] reqId=:requestId';
app.use(morgan(morganFormat));
app.use(express.json());

const parseExpiresAt = (value: string | null | undefined) => {
    if (!value) return null;
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime();
};

app.use(async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    const path = req.path;
    if (path === '/api/health' || path === '/api/auth/login') {
        return next();
    }
    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const headerToken = typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'] : '';
    const token = bearerToken || headerToken;
    if (!token) {
        return res.status(401).json({ error: '未登录' });
    }
    const cachedUser = getCachedAuthUser(token);
    if (cachedUser) {
        (req as any).user = cachedUser;
        return next();
    }
    try {
        const db = getDb();
        const now = new Date().toLocaleString('sv-SE');
        const tokenHash = hashToken(token);
        const user = await db.get(
            `SELECT u.id, u.username, u.role, t.expires_at
             FROM user_tokens t
             JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ? AND (t.expires_at IS NULL OR t.expires_at > ?)`,
            tokenHash,
            now
        );
        if (!user) {
            return res.status(401).json({ error: '登录已过期' });
        }
        const expiresAtMs = parseExpiresAt(user.expires_at);
        setCachedAuthUser(token, { id: user.id, username: user.username, role: user.role }, expiresAtMs);
        (req as any).user = user;
        next();
    } catch (error: any) {
        res.status(500).json({ error: error.message || '鉴权失败' });
    }
});

// Routes
app.use('/api/douban', doubanRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tracker', trackerRoutes);
app.use('/api/tasks', taskRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    logger.error(`[GlobalError] ${req.method} ${req.path} - Status: ${status}`, {
        requestId: (req as any).requestId,
        message,
        error: err
    });

    res.status(status).json({
        error: message
    });
});

async function startServer() {
    try {
        await initDb();
        const telegram = TelegramService.getInstance();
        await telegram.init();
        const discord = DiscordService.getInstance();
        await discord.init();
        const tracker = TrackerService.getInstance();
        const server: Server = app.listen(port, () => {
            logger.info(`HoraceMovie Backend running at http://localhost:${port}`);
        });
        const sockets = new Set<Socket>();
        server.on('connection', (socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
        });

        // Graceful shutdown
        let isShuttingDown = false;
        const shutdown = async () => {
            if (isShuttingDown) return;
            isShuttingDown = true;

            try {
                for (const socket of sockets) {
                    socket.destroy();
                }
            } catch {}

            if (isDev) {
                try {
                    void tracker.stop();
                } catch {}
                try {
                    void telegram.stop();
                    void discord.stop();
                } catch {}
                try {
                    void closeDb();
                } catch {}
                try {
                    server.close();
                } catch {}
                process.exit(0);
            }

            const forceExitTimer = setTimeout(() => process.exit(1), 5000);
            forceExitTimer.unref();

            try {
                await tracker.stop();
                await telegram.stop();
                await discord.stop();
            } catch {}

            try {
                await new Promise<void>((resolve) => {
                    try {
                        server.close(() => resolve());
                    } catch {
                        resolve();
                    }
                });
            } catch {}

            try {
                await closeDb();
            } catch {}

            clearTimeout(forceExitTimer);
            process.exit(0);
        };

        process.once('SIGTERM', () => void shutdown());
        process.once('SIGINT', () => void shutdown());

    } catch (error) {
        logger.error('Failed to start server', { error });
        process.exit(1);
    }
}

startServer();
