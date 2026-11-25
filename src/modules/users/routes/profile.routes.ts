import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate';
import { validateRequest } from '../../../middleware/validateRequest';
import * as profileController from '../controllers/profile.controller';
import { updateProfileSchema } from '../validators/profile.validators';

const router = Router();

router.get('/profile', authenticate, profileController.getProfile);
router.patch(
  '/profile',
  authenticate,
  validateRequest({ body: updateProfileSchema }),
  profileController.updateProfile
);

export default router;
