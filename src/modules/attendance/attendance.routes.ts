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
import { BadRequestError, ForbiddenError } from '../../common/errors/app.error';

const router = Router();
const attendanceAdminRoles = ['Super Admin', 'HR Admin', 'HR Officer'];

function isAttendanceAdmin(req: Request): boolean {
  return attendanceAdminRoles.includes(req.user?.roleName || '');
}

function getOwnEmployeeId(req: Request): string {
  if (!req.user?.employeeId) {
    throw new BadRequestError('User account is not linked to an employee profile.');
  }
  return req.user.employeeId;
}

function getClockEmployeeId(req: Request): string {
  if (!isAttendanceAdmin(req)) return getOwnEmployeeId(req);

  const employeeId = req.body.employeeId || req.user?.employeeId;
  if (!employeeId) throw new BadRequestError('An employee profile is required.');
  return employeeId;
}

router.post(
  '/clock-in',
  authenticate,
  validateRequest({ body: clockInSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employeeId = getClockEmployeeId(req);

      const result = await attendanceService.clockIn(
        employeeId,
        req.body.notes,
        req.user!.id,
        req.ip,
        req.user!.timeZone || 'UTC'
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
      const employeeId = getClockEmployeeId(req);

      const result = await attendanceService.clockOut(
        employeeId,
        req.body.notes,
        req.user!.id,
        req.ip,
        req.user!.timeZone || 'UTC'
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
      if (!isAttendanceAdmin(req)) {
        throw new ForbiddenError('Only HR or Super Admin users can create or correct attendance records.');
      }
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
      if (!isAttendanceAdmin(req)) filters.employeeId = getOwnEmployeeId(req);
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
      const employeeId = isAttendanceAdmin(req) ? undefined : getOwnEmployeeId(req);

      const summary = await attendanceService.getAttendanceSummary(departmentId, startDate, endDate, employeeId);
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
      const currentPeriod = new Intl.DateTimeFormat('en', {
        timeZone: req.user!.timeZone || 'UTC',
        year: 'numeric',
        month: 'numeric',
      }).formatToParts(new Date());
      const currentParts = new Map(currentPeriod.map((part) => [part.type, part.value]));
      const year = req.query.year ? Number(req.query.year) : Number(currentParts.get('year'));
      const month = req.query.month ? Number(req.query.month) : Number(currentParts.get('month'));

      const employeeId = isAttendanceAdmin(req) ? req.params.employeeId : getOwnEmployeeId(req);
      const records = await attendanceService.getMonthlyView(employeeId, year, month);
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
      if (!isAttendanceAdmin(req)) filters.employeeId = getOwnEmployeeId(req);
      const csv = await attendanceService.exportCsv(filters, req.user!.timeZone || 'UTC');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${Date.now()}.csv"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
