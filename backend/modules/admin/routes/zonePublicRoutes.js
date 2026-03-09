import express from 'express';
import { detectAllUserZones, detectUserZone, getActiveZonesPublic } from '../controllers/zoneController.js';

const router = express.Router();

// Public route - Zone detection for users (no auth required)
router.get('/zones/detect', detectUserZone);
router.get('/zones/detect-all', detectAllUserZones);
router.get('/zones/active', getActiveZonesPublic);

export default router;
