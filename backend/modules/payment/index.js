import express from 'express';
import { initializeRazorpay } from './services/razorpayService.js';
import { getRazorpayCredentials } from '../../shared/utils/envService.js';

// Initialize Razorpay on module load
initializeRazorpay();

const router = express.Router();

// Payment routes can be added here if needed
router.get('/health', async (req, res) => {
  const credentials = await getRazorpayCredentials();
  res.json({ 
    success: true, 
    message: 'Payment module is active',
    razorpayConfigured: !!(credentials.keyId && credentials.keySecret)
  });
});

export default router;

