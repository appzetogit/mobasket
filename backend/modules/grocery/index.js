import express from 'express';
import groceryRoutes from './routes/groceryRoutes.js';
import groceryStoreRoutes from './routes/groceryStoreRoutes.js';

const router = express.Router();

router.use('/', groceryRoutes);
router.use('/stores', groceryStoreRoutes);

export default router;

