import request from './request';

export const login = (data: any) => request.post('/auth/login', data) as Promise<any>;
export const getUsers = () => request.get('/auth/users') as Promise<any>;
export const createUser = (data: any) => request.post('/auth/users', data) as Promise<any>;
export const deleteUser = (id: number) => request.delete(`/auth/users/${id}`) as Promise<any>;
