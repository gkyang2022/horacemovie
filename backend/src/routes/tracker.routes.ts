import { Router } from 'express';
import * as trackerController from '../controllers/tracker.controller.js';

const router = Router();

router.get('/tasks', trackerController.getTasks);
router.post('/tasks', trackerController.createTask);
router.put('/tasks/:id', trackerController.updateTask);
router.delete('/tasks/:id', trackerController.deleteTask);

export default router;
