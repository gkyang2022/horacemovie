import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';

const router = Router();

router.get('/', settingsController.getSettings);
router.post('/', settingsController.updateSettings);

export default router;
