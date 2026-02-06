import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import 'express-async-errors';
import { closeDb, initDb } from './db/index.js';
import doubanRoutes from './routes/douban.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import searchRoutes from './routes/search.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import authRoutes from './routes/auth.routes.js';
import trackerRoutes from './routes/tracker.routes.js';
import taskRoutes from './routes/task.routes.js';
import { TrackerService } from './services/tracker.service.js';
import { TelegramService } from './services/telegram.service.js';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';

dotenv.config();

const app = express();
const port = process.env.PORT || 8008;

// Middlewares
app.use(helmet({
    contentSecurityPolicy: false, // For easier dev, adjust for prod
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

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
    
    console.error(`[GlobalError] ${req.method} ${req.path} - Status: ${status}`);
    console.error(`[GlobalError] Message: ${message}`);
    if (status === 500) {
        console.error(`[GlobalError] Stack: ${err.stack}`);
    }
    
    res.status(status).json({
        error: message
    });
});

async function startServer() {
    try {
        await initDb();
        const telegram = TelegramService.getInstance(); // Start bot
        await telegram.init();
        const tracker = TrackerService.getInstance(); // Start scheduler
        const server: Server = app.listen(port, () => {
            console.log(`HoraceMovie Backend running at http://localhost:${port}`);
        });
        const sockets = new Set<Socket>();
        server.on('connection', (socket) => {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
        });

        // Graceful shutdown
        const isDev = process.argv[1]?.endsWith('.ts') || process.env.NODE_ENV !== 'production';
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
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
