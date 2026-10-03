import { Router } from 'express';
import { UploadController } from '../controllers/UploadController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/presign', protect, UploadController.presign);

export default router;
