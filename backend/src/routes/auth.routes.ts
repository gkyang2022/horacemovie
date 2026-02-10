import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refreshToken);
router.get('/users', authController.getUsers);
router.post('/users', authController.createUser);
router.delete('/users/:id', authController.deleteUser);
router.post('/update-me', authController.updateMe);

export default router;
