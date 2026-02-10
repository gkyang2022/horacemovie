import { Request, Response } from 'express';
import { PansouService } from '../services/pansou.service.js';
import { logger } from '../logger.js';

const pansouService = PansouService.getInstance();

export const searchResources = async (req: Request, res: Response) => {
    const { q, refresh } = req.query;
    const refreshFlag = refresh === 'true' || refresh === '1';
    const keyword = typeof q === 'string' ? q.slice(0, 80) : '';
    logger.debug('[SearchController] GET /api/search', {
        requestId: (req as any).requestId,
        q: keyword,
        refresh: refreshFlag
    });

    if (!q) {
        logger.warn('[SearchController] Missing query parameter "q"', { requestId: (req as any).requestId });
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    try {
        const results = await pansouService.search(q as string, refreshFlag);
        logger.info('[SearchController] Search completed', {
            requestId: (req as any).requestId,
            q: keyword,
            results: results.length
        });
        res.json(results);
    } catch (error: any) {
        logger.error('[SearchController] Search failed', {
            requestId: (req as any).requestId,
            q: keyword,
            error
        });
        res.status(500).json({ error: error.message });
    }
};
