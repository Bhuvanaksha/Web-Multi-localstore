import { Router } from 'express';
import adminRoutes from './adminRoutes.js';
import authRoutes from './authRoutes.js';
import commentRoutes from './commentRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import orderRoutes from './orderRoutes.js';
import providerListingRoutes from './providerListingRoutes.js';
import resourceRoutes from './resourceRoutes.js';
import searchRoutes from './searchRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import voteRoutes from './voteRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/resources', resourceRoutes);
router.use(commentRoutes);
router.use('/votes', voteRoutes);
router.use('/search', searchRoutes);
router.use('/uploads', uploadRoutes);
router.use('/notifications', notificationRoutes);
router.use('/provider/listings', providerListingRoutes);
router.use('/orders', orderRoutes);

export default router;
