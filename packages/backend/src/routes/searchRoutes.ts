import { Router } from 'express';
import { SearchController } from '../controllers/SearchController.js';
import { searchLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/', searchLimiter, SearchController.search);

export default router;
