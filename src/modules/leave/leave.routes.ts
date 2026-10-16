import { Router, Request, Response, NextFunction } from 'express';
import { leaveService } from './leave.service';
import { sendSuccess, sendPaginated } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  createLeaveRequestSchema,
  reviewLeaveRequestSchema,
  cancelLeaveRequestSchema,
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  leaveFilterSchema,
} from './leave.schema';
import { BadRequestError } from '../../common/errors/app.error';

const router = Router();

// --- Leave Types ---
router.get(
  '/types',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const types = await leaveService.listLeaveTypes(includeInactive);
      sendSuccess(res, types, 'Leave types retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/types',
  authenticate,
  requirePermission('leave:manage'),
  validateRequest({ body: createLeaveTypeSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = await leaveService.createLeaveType(req.body);
      sendSuccess(res, type, 'Leave type created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/types/:id',
  authenticate,
  requirePermission('leave:manage'),
  validateRequest({ body: updateLeaveTypeSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = await leaveService.updateLeaveType(req.params.id, req.body);
      sendSuccess(res, type, 'Leave type updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

// --- Leave Balances ---
router.get(
  '/balances/:employeeId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const balances = await leaveService.getEmployeeBalances(req.params.employeeId, year);
      sendSuccess(res, balances, 'Employee leave balances retrieved');
    } catch (error) {
      next(error);
    }
  }
);

// --- Leave Requests ---
router.post(
  '/requests',
  authenticate,
  validateRequest({ body: createLeaveRequestSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeId = req.body.employeeId || req.user!.employeeId;
      if (!employeeId) {
        throw new BadRequestError('User account is not linked to an employee profile.');
      }

      const leave = await leaveService.requestLeave(
        { ...req.body, employeeId },
        req.user!.id,
        req.ip
      );
      sendSuccess(res, leave, 'Leave application submitted successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/requests',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = leaveFilterSchema.parse(req.query);
      const user = {
        id: req.user!.id,
        roleName: req.user!.roleName,
        employeeId: req.user!.employeeId,
      };

      const { items, total, page, limit } = await leaveService.listLeaveRequests(filters, user);
      sendPaginated(res, items, total, page, limit, 'Leave requests retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/requests/approvals',
  authenticate,
  requirePermission('leave:approve'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let pendingList: unknown[] = [];
      if (req.user!.roleName === 'Super Admin' || req.user!.roleName === 'HR Admin' || req.user!.roleName === 'HR Officer') {
        const { items } = await leaveService.listLeaveRequests(
          { status: 'PENDING', limit: 100, page: 1 },
          { id: req.user!.id, roleName: req.user!.roleName }
        );
        pendingList = items;
      } else {
        const managerEmpId = req.user!.employeeId;
        if (managerEmpId) {
          pendingList = await leaveService.listTeamPendingLeaves(managerEmpId);
        }
      }
      sendSuccess(res, pendingList, 'Pending approvals retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/requests/:id/review',
  authenticate,
  requirePermission('leave:approve'),
  validateRequest({ body: reviewLeaveRequestSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reviewer = {
        id: req.user!.id,
        roleName: req.user!.roleName,
        employeeId: req.user!.employeeId,
      };

      const result = await leaveService.reviewLeave(req.params.id, req.body, reviewer, req.ip);
      sendSuccess(res, result, `Leave request ${req.body.action.toLowerCase()}d successfully`);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/requests/:id/cancel',
  authenticate,
  validateRequest({ body: cancelLeaveRequestSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await leaveService.cancelLeave(
        req.params.id,
        req.body,
        req.user!.id,
        req.user!.employeeId
      );
      sendSuccess(res, result, 'Leave request cancelled successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/calendar',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : new Date().toISOString().substring(0, 7) + '-01';
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : new Date().toISOString().substring(0, 7) + '-28';
      const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;

      const calendarLeaves = await leaveService.getLeaveCalendar(startDate, endDate, departmentId);
      sendSuccess(res, calendarLeaves, 'Leave calendar retrieved');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
