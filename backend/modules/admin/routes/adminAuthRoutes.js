import express from 'express';
import {
  adminLogin,
  getCurrentAdmin,
  adminLogout,
  refreshAdminToken
} from '../controllers/adminAuthController.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required()
});

// Public routes
router.post('/login', validate(loginSchema), adminLogin);
router.post('/refresh-token', refreshAdminToken);

// Protected routes
router.get('/me', authenticateAdmin, getCurrentAdmin);
router.post('/logout', authenticateAdmin, adminLogout);

export default router;

