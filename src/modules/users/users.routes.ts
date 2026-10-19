import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/prisma';
import { sendPaginated, sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requireRole } from '../../common/middleware/auth.middleware';
import { parsePaginationParams } from '../../common/utils/pagination.utils';

const router = Router();

router.get(
  '/',
  authenticate,
  requireRole('Super Admin', 'HR Admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parsePaginationParams(req);
      const where: Record<string, unknown> = {};

      if (pagination.search) {
        where.email = { contains: pagination.search };
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: pagination.skip,
          take: pagination.limit,
          select: {
            id: true,
            email: true,
            isActive: true,
            lastLoginAt: true,
            createdAt: true,
            role: { select: { id: true, name: true } },
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                workEmail: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      sendPaginated(res, users, total, pagination.page, pagination.limit, 'Users list retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/roles',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roles = await prisma.role.findMany({
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });
      sendSuccess(res, roles, 'Roles retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/permissions',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const permissions = await prisma.permission.findMany({
        orderBy: [{ module: 'asc' }, { code: 'asc' }],
      });
      sendSuccess(res, permissions, 'Permissions retrieved');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
