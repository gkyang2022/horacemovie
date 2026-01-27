import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import 'express-async-errors';
import { initDb } from './db/index.js';
import doubanRoutes from './routes/douban.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import searchRoutes from './routes/search.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import authRoutes from './routes/auth.routes.js';
import trackerRoutes from './routes/tracker.routes.js';
import { TrackerService } from './services/tracker.service.js';

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

async function startServer() {
    try {
        await initDb();
        const tracker = TrackerService.getInstance(); // Start scheduler and bot
        const server = app.listen(port, () => {
            console.log(`HoraceMovie Backend running at http://localhost:${port}`);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            console.log(`Received ${signal}. Exiting...`);
            
            // Just force exit immediately for tsx. 
            // Most resources like DB and Bot handles unexpected termination well enough for dev.
            // This is the only way to stop the "Force killing..." message from tsx.
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
