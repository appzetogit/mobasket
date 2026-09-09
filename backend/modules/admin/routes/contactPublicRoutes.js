import express from 'express';
import { submitContactMessage } from '../controllers/contactMessageController.js';

const router = express.Router();

// Public route - no authentication required.
// Rate limiting is applied in server.js alongside the other public limiters.
router.post('/contact', submitContactMessage);

export default router;
