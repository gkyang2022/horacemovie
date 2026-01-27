import { Request, Response } from 'express';
import { PansouService } from '../services/pansou.service.js';

const pansouService = PansouService.getInstance();

export const searchResources = async (req: Request, res: Response) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    try {
        const results = await pansouService.search(q as string);
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
