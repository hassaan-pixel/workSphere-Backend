import { Router, Request, Response } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import employeesRoutes from '../modules/employees/employees.routes';
import departmentsRoutes from '../modules/departments/departments.routes';
import designationsRoutes from '../modules/designations/designations.routes';
import usersRoutes from '../modules/users/users.routes';
import attendanceRoutes from '../modules/attendance/attendance.routes';
import shiftsRoutes from '../modules/shifts/shifts.routes';
import leaveRoutes from '../modules/leave/leave.routes';
import holidaysRoutes from '../modules/holidays/holidays.routes';
import recruitmentRoutes from '../modules/recruitment/recruitment.routes';
import onboardingRoutes from '../modules/onboarding/onboarding.routes';
import notificationsRoutes from '../modules/notifications/notifications.routes';
import payrollRoutes from '../modules/payroll/payroll.routes';
import performanceRoutes from '../modules/performance/performance.routes';
import reportsRoutes from '../modules/reports/reports.routes';
import settingsRoutes from '../modules/settings/settings.routes';
import { prisma } from '../database/prisma';

const router = Router();

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'error';
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
    version: '1.0.0',
    app: 'WorkSphere HR System API',
  });
});

// Mount module routes
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/employees', employeesRoutes);
router.use('/departments', departmentsRoutes);
router.use('/designations', designationsRoutes);
router.use('/users', usersRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/shifts', shiftsRoutes);
router.use('/leave', leaveRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/payroll', payrollRoutes);
router.use('/performance', performanceRoutes);
router.use('/reports', reportsRoutes);
router.use('/settings', settingsRoutes);

export default router;
