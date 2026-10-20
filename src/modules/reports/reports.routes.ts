import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { sendSuccess } from '../../common/utils/response.utils';
import { reportsService } from './reports.service';
import { calendarDateInZone } from '../../common/utils/timezone.utils';

const router = Router();
router.use(authenticate);

// Overall Executive KPI Dashboard
router.get('/overview', requirePermission('reports:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, await reportsService.getOverview(req.user?.timeZone || 'UTC'));
  } catch (error) {
    next(error);
  }
});

// Headcount & Demographics Report
router.get('/headcount', requirePermission('reports:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deptId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
    sendSuccess(res, await reportsService.getHeadcountReport(deptId));
  } catch (error) {
    next(error);
  }
});

// Attendance & Overtime Report
router.get('/attendance', requirePermission('reports:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const timeZone = req.user!.timeZone || 'UTC';
    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const todayValues = new Map(todayParts.map((part) => [part.type, part.value]));
    const today = `${todayValues.get('year')}-${todayValues.get('month')}-${todayValues.get('day')}`;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : today;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : today;
    const deptId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
    sendSuccess(res, await reportsService.getAttendanceReport(startDate, endDate, deptId));
  } catch (error) {
    next(error);
  }
});

// Leave & Utilization Report
router.get('/leave', requirePermission('reports:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const localYear = calendarDateInZone(new Date(), req.user!.timeZone || 'UTC').year;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : localYear;
    const deptId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
    sendSuccess(res, await reportsService.getLeaveReport(year, deptId));
  } catch (error) {
    next(error);
  }
});

// Payroll & Cost Distribution Report
router.get('/payroll', requirePermission('reports:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, await reportsService.getPayrollReport());
  } catch (error) {
    next(error);
  }
});

// CSV Export Endpoint
router.get('/:type/export', requirePermission('reports:export'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const csv = await reportsService.getExportCsv(req.params.type, req.query as Record<string, string>, req.user!.timeZone || 'UTC');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-report.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
