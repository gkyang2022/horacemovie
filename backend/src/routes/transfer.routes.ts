import { Router } from 'express';
import * as transferController from '../controllers/transfer.controller.js';

const router = Router();

router.post('/save', transferController.transferAndSync);
router.post('/sync', transferController.syncToNas);

export default router;
