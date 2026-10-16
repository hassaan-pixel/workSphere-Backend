import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission, requireRole } from '../../common/middleware/auth.middleware';
import { sendSuccess } from '../../common/utils/response.utils';
import { settingsService } from './settings.service';
import { prisma } from '../../database/prisma';

const router = Router();
router.use(authenticate);

// Get global settings
router.get('/', requirePermission('settings:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.getAllSettings();
    sendSuccess(res, data, 'Settings loaded successfully');
  } catch (error) {
    next(error);
  }
});

// Update global settings
router.post('/', requirePermission('settings:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateSettings(req.body, req.user!.id);
    sendSuccess(res, data, 'Settings updated successfully');
  } catch (error) {
    next(error);
  }
});

// List leave types
router.get('/leave-types', requirePermission('settings:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.listLeaveTypes();
    sendSuccess(res, data, 'Leave types retrieved');
  } catch (error) {
    next(error);
  }
});

// Create leave type
router.post('/leave-types', requirePermission('settings:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.createLeaveType(req.body, req.user!.id);
    sendSuccess(res, data, 'Leave type created successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Update leave type
router.patch('/leave-types/:id', requirePermission('settings:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await settingsService.updateLeaveType(req.params.id, req.body, req.user!.id);
    sendSuccess(res, data, 'Leave type updated successfully');
  } catch (error) {
    next(error);
  }
});

// Roles and permissions matrix
router.get('/roles-matrix', requireRole('Super Admin', 'HR Admin'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({
        include: {
          rolePermissions: {
            include: { permission: true },
          },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.permission.findMany({
        orderBy: [{ module: 'asc' }, { code: 'asc' }],
      }),
    ]);
    sendSuccess(res, { roles, permissions }, 'Roles and permissions matrix retrieved');
  } catch (error) {
    next(error);
  }
});

export default router;
