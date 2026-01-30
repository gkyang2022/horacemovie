import { Router } from 'express';
import * as doubanController from '../controllers/douban.controller.js';

const router = Router();

router.get('/popular', doubanController.getPopular);
router.get('/charts', doubanController.getCharts);
router.get('/top-list', doubanController.getTopList);
router.get('/search', doubanController.search);
router.get('/recommendations', doubanController.getRecommendations);
router.get('/detail/:type/:id', doubanController.getDetail);

export default router;
