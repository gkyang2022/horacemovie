import { Request, Response } from 'express';
import { PansouService } from '../services/pansou.service.js';

const pansouService = PansouService.getInstance();

export const searchResources = async (req: Request, res: Response) => {
    const { q, refresh } = req.query;
    const refreshFlag = refresh === 'true' || refresh === '1';
    console.log(`[SearchController] GET /api/search?q=${q}&refresh=${refreshFlag}`);

    if (!q) {
        console.warn('[SearchController] Missing query parameter "q"');
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    try {
        const results = await pansouService.search(q as string, refreshFlag);
        console.log(`[SearchController] Search for "${q}" completed with ${results.length} results`);
        res.json(results);
    } catch (error: any) {
        console.error(`[SearchController] Search failed for "${q}":`, error.message);
        res.status(500).json({ error: error.message });
    }
};
