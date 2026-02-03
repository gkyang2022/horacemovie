import { Router } from 'express';
import * as taskController from '../controllers/task.controller.js';

const router = Router();

router.get('/', taskController.getUserTasks);
router.post('/op', taskController.handleTaskOp);

export default router;
