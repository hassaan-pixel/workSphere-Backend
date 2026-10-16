import { Router } from 'express';
import { authController } from './auth.controller';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { loginSchema } from './auth.schema';
import { authenticate } from '../../common/middleware/auth.middleware';

const router = Router();

router.post('/login', validateRequest({ body: loginSchema }), (req, res, next) =>
  authController.login(req, res, next)
);

router.post('/logout', (req, res, next) =>
  authController.logout(req, res, next)
);

router.get('/me', authenticate, (req, res, next) =>
  authController.me(req, res, next)
);

export default router;
