import {
  CreateProviderListingSchema,
  SELLER_ROLES,
  UpdateProviderListingSchema,
} from '@alpha/shared';
import { Router } from 'express';
import { ProviderListingController } from '../controllers/ProviderListingController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const router = Router();

// Public marketplace feed
router.get('/', ProviderListingController.list);

// Static paths MUST be registered before /:id.
router.get('/mine', protect, ProviderListingController.mine);
router.get('/export', protect, restrictTo(...SELLER_ROLES), ProviderListingController.mineExport);

// Authenticated CRUD — only sellers can list items for sale.
router.post(
  '/',
  protect,
  restrictTo(...SELLER_ROLES),
  validate(CreateProviderListingSchema),
  ProviderListingController.create,
);
router.put(
  '/:id',
  protect,
  restrictTo(...SELLER_ROLES),
  validate(UpdateProviderListingSchema),
  ProviderListingController.update,
);
router.delete('/:id', protect, restrictTo(...SELLER_ROLES), ProviderListingController.remove);

export default router;
