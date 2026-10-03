import { CreateCommentSchema } from '@alpha/shared';
import { Router } from 'express';
import { CommentController } from '../controllers/CommentController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

// GET /api/v1/resources/:resourceId/comments
router.get('/resources/:resourceId/comments', CommentController.listTree);

// POST /api/v1/comments
router.post('/comments', protect, validate(CreateCommentSchema), CommentController.create);

export default router;
