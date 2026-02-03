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
