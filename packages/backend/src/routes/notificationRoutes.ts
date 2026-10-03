import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, NotificationController.list);
router.post('/read-all', protect, NotificationController.markAllRead);
router.post('/:id/read', protect, NotificationController.markRead);

export default router;
