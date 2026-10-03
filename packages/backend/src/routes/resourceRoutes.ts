import { AUTHOR_ROLES, CreateResourceSchema, UpdateResourceSchema } from '@alpha/shared';
import { Router } from 'express';
import { ResourceController } from '../controllers/ResourceController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

// Public
router.get('/', ResourceController.list);

// Static paths MUST be registered before /:id so they are not captured.
router.get('/mine', protect, ResourceController.mine);
router.get('/admin/all', protect, restrictTo('admin'), ResourceController.adminList);

router.get('/:id', ResourceController.detail);

// Authenticated — customers (buyers) and providers (sellers) can't publish
// community resources; that stays with members, moderators and admins.
router.post(
  '/',
  protect,
  restrictTo(...AUTHOR_ROLES),
  validate(CreateResourceSchema),
  ResourceController.create,
);
router.put(
  '/:id',
  protect,
  restrictTo(...AUTHOR_ROLES),
  validate(UpdateResourceSchema),
  ResourceController.update,
);
router.delete('/:id', protect, restrictTo(...AUTHOR_ROLES), ResourceController.remove);
router.post('/:id/submit', protect, restrictTo(...AUTHOR_ROLES), ResourceController.submit);

// Moderator / admin review actions
router.post('/:id/approve', protect, restrictTo('moderator', 'admin'), ResourceController.approve);
router.post('/:id/reject', protect, restrictTo('moderator', 'admin'), ResourceController.reject);
router.post(
  '/:id/request-changes',
  protect,
  restrictTo('moderator', 'admin'),
  ResourceController.requestChanges,
);

export default router;
