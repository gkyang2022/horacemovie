import { Router } from 'express';
import * as doubanController from '../controllers/douban.controller.js';

const router = Router();

router.get('/popular', doubanController.getPopular);
router.get('/charts', doubanController.getCharts);
router.get('/top-list', doubanController.getTopList);
router.get('/search', doubanController.search);
router.get('/recommendations', doubanController.getRecommendations);
router.get('/detail/:type/:id', doubanController.getDetail);
router.get('/image-proxy', async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl || !imageUrl.includes('doubanio.com')) {
        return res.status(400).send('Invalid image URL');
    }

    try {
        const response = await fetch(imageUrl, {
            headers: {
                'Referer': 'https://movie.douban.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            return res.status(response.status).send('Failed to fetch from Douban');
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});

export default router;
