import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';

const router = Router();

router.get('/', settingsController.getSettings);
router.post('/', settingsController.updateSettings);
router.get('/cloud-accounts', settingsController.getCloudAccounts);
router.post('/cloud-accounts', settingsController.updateCloudAccount);

export default router;
