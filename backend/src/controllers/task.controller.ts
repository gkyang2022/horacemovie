import { Request, Response } from 'express';
import { OpenListService } from '../services/openlist.service.js';

const openlistService = OpenListService.getInstance();

export const getUserTasks = async (req: Request, res: Response) => {
    try {
        // 暂时移除用户任务过滤逻辑，直接返回 OpenList 中的所有任务
        const [undoneTasks, doneTasks] = await Promise.all([
            openlistService.getTasks('undone'),
            openlistService.getTasks('done')
        ]);

        res.json({
            undone: undoneTasks,
            done: doneTasks
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const handleTaskOp = async (req: Request, res: Response) => {
    const { op, tid } = req.body;
    
    if (!op || !tid) {
        return res.status(400).json({ error: '缺少操作类型或任务 ID' });
    }

    try {
        const success = await openlistService.taskOperation(op as any, tid);
        if (success) {
            res.json({ message: '操作成功' });
        } else {
            res.status(500).json({ error: '操作失败' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const handleBatchTaskOp = async (req: Request, res: Response) => {
    const { op } = req.params;
    const tids = req.body;

    if (!Array.isArray(tids)) {
        return res.status(400).json({ error: '请求体必须是 ID 数组' });
    }

    try {
        const result = await openlistService.batchTaskOperation(op as any, tids);
        if (result) {
            res.json(result);
        } else {
            res.status(500).json({ error: '批量操作失败' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const handleFullTaskOp = async (req: Request, res: Response) => {
    const { type } = req.params;

    try {
        const result = await openlistService.fullTaskOperation(type as any);
        if (result) {
            res.json(result);
        } else {
            res.status(500).json({ error: '全量操作失败' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
