import { VoteInputSchema } from '@alpha/shared';
import { Router } from 'express';
import { VoteController } from '../controllers/VoteController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

router.post('/toggle', protect, validate(VoteInputSchema), VoteController.toggle);

export default router;
