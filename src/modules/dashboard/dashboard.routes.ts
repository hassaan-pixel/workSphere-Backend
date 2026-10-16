import { Router } from 'express';
import { dashboardController } from './dashboard.controller';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';

const router = Router();

router.get(
  '/metrics',
  authenticate,
  requirePermission('dashboard:view'),
  (req, res, next) => dashboardController.getMetrics(req, res, next)
);

export default router;
