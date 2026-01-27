import { Router } from 'express';
import * as doubanController from '../controllers/douban.controller.js';

const router = Router();

router.get('/popular', doubanController.getPopular);
router.get('/search', doubanController.search);
router.get('/detail/:type/:id', doubanController.getDetail);

export default router;
