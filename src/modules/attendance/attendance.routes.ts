import { Router, Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service';
import { sendSuccess, sendPaginated } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  clockInSchema,
  clockOutSchema,
  manualAttendanceSchema,
  attendanceFilterSchema,
} from './attendance.schema';
import { BadRequestError } from '../../common/errors/app.error';

const router = Router();

router.post(
  '/clock-in',
  authenticate,
  validateRequest({ body: clockInSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeId = req.body.employeeId || req.user!.employeeId;
      if (!employeeId) {
        throw new BadRequestError('User account is not linked to an employee profile.');
      }

      const result = await attendanceService.clockIn(
        employeeId,
        req.body.notes,
        req.user!.id,
        req.ip
      );
      sendSuccess(res, result, 'Clocked in successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/clock-out',
  authenticate,
  validateRequest({ body: clockOutSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeId = req.body.employeeId || req.user!.employeeId;
      if (!employeeId) {
        throw new BadRequestError('User account is not linked to an employee profile.');
      }

      const result = await attendanceService.clockOut(
        employeeId,
        req.body.notes,
        req.user!.id,
        req.ip
      );
      sendSuccess(res, result, 'Clocked out successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/manual',
  authenticate,
  requirePermission('attendance:write'),
  validateRequest({ body: manualAttendanceSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = await attendanceService.recordManualAttendance(
        req.body,
        req.user!.id,
        req.ip
      );
      sendSuccess(res, record, 'Manual attendance record created/updated successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/',
  authenticate,
  requirePermission('attendance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = attendanceFilterSchema.parse(req.query);
      const { items, total, page, limit } = await attendanceService.listAttendance(filters);
      sendPaginated(res, items, total, page, limit, 'Attendance records retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/summary',
  authenticate,
  requirePermission('attendance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

      const summary = await attendanceService.getAttendanceSummary(departmentId, startDate, endDate);
      sendSuccess(res, summary, 'Attendance summary retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/monthly/:employeeId',
  authenticate,
  requirePermission('attendance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;

      const records = await attendanceService.getMonthlyView(req.params.employeeId, year, month);
      sendSuccess(res, records, 'Monthly attendance records retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/export',
  authenticate,
  requirePermission('attendance:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = attendanceFilterSchema.parse(req.query);
      const csv = await attendanceService.exportCsv(filters);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
