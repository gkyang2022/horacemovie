import { Request, Response } from 'express';
import { DoubanService } from '../services/douban.service.js';

const doubanService = DoubanService.getInstance();

export const getPopular = async (req: Request, res: Response) => {
    const type = (req.query.type as 'movie' | 'tv' | 'variety' | 'animation' | 'documentary' | 'showing' | 'soon') || 'movie';
    const subType = req.query.sub_type as string;
    const start = parseInt(req.query.start as string) || 0;
    const count = parseInt(req.query.count as string) || 20;

    console.log(`[DoubanController] GET /api/douban/popular?type=${type}&sub_type=${subType || ''}&start=${start}&count=${count}`);
    
    let result;
    if (type === 'tv' && subType) {
        // 如果是电视剧且有子类型，使用 rexxar 的 recent_hot 接口
        result = await doubanService.getRecentHot('tv', subType, start, count);
    } else if (type === 'variety' && subType) {
        // 如果是综艺且有子类型，使用 rexxar 的 recent_hot 接口，category 固定为 show
        result = await doubanService.getRecentHot('tv', subType, start, count, 'show');
    } else {
        // 综合或其他情况，使用原有的 popular 接口
        result = await doubanService.getPopular(type, start, count);
    }
    
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

export const getCharts = async (req: Request, res: Response) => {
    console.log('[DoubanController] GET /api/douban/charts');
    const result = await doubanService.getCharts();
    res.json(result);
};

export const getRecommendations = async (req: Request, res: Response) => {
    const kind = (req.query.kind as string) || 'movie';
    const sort = (req.query.sort as string) || 'T';
    const start = parseInt(req.query.start as string) || 0;
    const count = parseInt(req.query.count as string) || 20;

    // 解析 categories
    let categories: any = {};
    if (req.query.categories) {
        try {
            categories = JSON.parse(req.query.categories as string);
        } catch (e) {
            console.error('[DoubanController] Failed to parse categories JSON:', e);
        }
    }

    // 兼容 LunaTV 风格的扁平化参数映射到豆瓣的 selected_categories
    // 映射关系：category -> 类型, format -> 形式, region -> 地区, year -> 年代, platform -> 平台
    const tagList: string[] = [];
    if (req.query.category && req.query.category !== 'all') {
        categories['类型'] = req.query.category;
        tagList.push(req.query.category as string);
    }
    if (req.query.format && req.query.format !== 'all') {
        categories['形式'] = req.query.format;
        // 如果是综艺，且已经有具体类型，则不把“综艺”放入 tags，以匹配豆瓣行为
        if (!(req.query.format === '综艺' && req.query.category && req.query.category !== 'all')) {
            tagList.push(req.query.format as string);
        }
    }
    if (req.query.region && req.query.region !== 'all') {
        categories['地区'] = req.query.region;
        tagList.push(req.query.region as string);
    }
    if (req.query.year && req.query.year !== 'all') {
        categories['年代'] = req.query.year;
        tagList.push(req.query.year as string);
    }
    if (req.query.platform && req.query.platform !== 'all') {
        categories['平台'] = req.query.platform;
        tagList.push(req.query.platform as string);
    }

    // 如果是动画且 kind 是 tv，但没有指定形式，默认加上“电视剧”形式（匹配豆瓣 API 行为）
    if (req.query.category === '动画' && kind === 'tv' && !categories['形式']) {
        categories['形式'] = '电视剧';
    }

    // 电视剧频道（不带特定分类或带有通用电视剧分类时）自动补全“电视剧”形式
    if (kind === 'tv' && !categories['形式']) {
        categories['形式'] = '电视剧';
    }

    const tags = tagList.join(',');
    const score_range = (req.query.score_range as string) || '0,10';

    console.log(`[DoubanController] GET /api/douban/recommendations?kind=${kind}&categories=${JSON.stringify(categories)}&tags=${tags}&sort=${sort}&start=${start}&count=${count}`);
    const result = await doubanService.getRecommendations(kind, categories, sort, start, count, tags, score_range);
    res.json(result);
};
