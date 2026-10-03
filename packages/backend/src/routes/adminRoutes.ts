import { Router } from 'express';
import { AdminController } from '../controllers/AdminController.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = Router();

// Every route here requires an admin account.
router.use(protect, restrictTo('admin'));

router.get('/activity', AdminController.activity);
router.get('/activity/export', AdminController.activityExport);
router.get('/orders', AdminController.orders);
router.get('/orders/export', AdminController.ordersExport);
router.get('/report/download', AdminController.reportDownload);
router.get('/security/overview', AdminController.securityOverview);
router.get('/security/export', AdminController.securityExport);

export default router;
