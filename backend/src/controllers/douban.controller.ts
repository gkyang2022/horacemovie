import { Request, Response } from 'express';
import { DoubanService } from '../services/douban.service.js';

const doubanService = DoubanService.getInstance();

export const getPopular = async (req: Request, res: Response) => {
    const type = (req.query.type as 'movie' | 'tv') || 'movie';
    const start = parseInt(req.query.start as string) || 0;
    const count = parseInt(req.query.count as string) || 20;

    const result = await doubanService.getPopular(type, start, count);
    res.json(result);
};

export const search = async (req: Request, res: Response) => {
    const q = req.query.q as string;
    const start = parseInt(req.query.start as string) || 0;
    const count = parseInt(req.query.count as string) || 20;

    if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const result = await doubanService.search(q, start, count);
    res.json(result);
};

export const getDetail = async (req: Request, res: Response) => {
    const { id, type } = req.params;

    if (!id || !type) {
        return res.status(400).json({ error: 'ID and Type are required' });
    }

    const result = await doubanService.getDetail(id as string, type as string);
    if (!result) {
        return res.status(404).json({ error: 'Media not found' });
    }
    res.json(result);
};
