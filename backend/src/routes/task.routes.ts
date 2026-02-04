import { Router } from 'express';
import * as taskController from '../controllers/task.controller.js';

const router = Router();

router.get('/', taskController.getUserTasks);
router.post('/op', taskController.handleTaskOp);

// 批量处理接口
router.post('/copy/:op(cancel_some|delete_some|retry_some)', taskController.handleBatchTaskOp);

// 全量清理与恢复接口
router.post('/copy/:type(clear_done|clear_succeeded|retry_failed)', taskController.handleFullTaskOp);

export default router;
