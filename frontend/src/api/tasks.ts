import request from './request';

export interface OpenListTask {
    id: string;
    name: string;
    creator: string;
    creator_role: number;
    state: number;
    status: string;
    progress: number;
    start_time: string;
    end_time: string;
    total_bytes: number;
    error: string;
    src_dir?: string;
    dst_dir?: string;
    calculatedSpeed?: string;
}

export interface UserTasks {
    undone: OpenListTask[];
    done: OpenListTask[];
}

export const getUserTasks = () => request.get<any, UserTasks>('/tasks');

export const taskOp = (op: 'cancel' | 'delete' | 'retry', tid: string) => 
    request.post<any, { message: string }>('/tasks/op', { op, tid });

// 批量操作特定任务
export const batchCancelTasks = (tids: string[]) => 
    request.post<any, { code: number; message: string; data: Record<string, string> }>('/tasks/copy/cancel_some', tids);

export const batchDeleteTasks = (tids: string[]) => 
    request.post<any, { code: number; message: string; data: Record<string, string> }>('/tasks/copy/delete_some', tids);

export const batchRetryTasks = (tids: string[]) => 
    request.post<any, { code: number; message: string; data: Record<string, string> }>('/tasks/copy/retry_some', tids);

// 全量清理与恢复接口
export const clearDoneTasks = () => 
    request.post<any, { code: number; message: string; data: null }>('/tasks/copy/clear_done');

export const clearSucceededTasks = () => 
    request.post<any, { code: number; message: string; data: null }>('/tasks/copy/clear_succeeded');

export const retryFailedTasks = () => 
    request.post<any, { code: number; message: string; data: null }>('/tasks/copy/retry_failed');
