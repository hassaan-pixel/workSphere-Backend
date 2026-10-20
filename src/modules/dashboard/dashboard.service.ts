import { prisma } from '../../database/prisma';
import { calendarDateInZone, dateOnlyUtc } from '../../common/utils/timezone.utils';

export interface DashboardMetrics {
  summary: {
    totalEmployees: number;
    activeEmployees: number;
    onLeaveToday: number;
    presentToday: {
      count: number | null;
      isImplemented: boolean;
      status: string;
    };
  };
  departmentDistribution: Array<{
    id: string;
    name: string;
    code: string;
    employeeCount: number;
    percentage: number;
  }>;
  recentAdditions: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    workEmail: string;
    department: string;
    designation: string;
    hireDate: string;
    employmentStatus: string;
    employmentType: string;
    avatarUrl: string | null;
  }>;
  upcomingEvents: {
    birthdays: Array<{
      id: string;
      fullName: string;
      department: string;
      date: string;
      daysRemaining: number;
    }>;
    anniversaries: Array<{
      id: string;
      fullName: string;
      department: string;
      years: number;
      date: string;
      daysRemaining: number;
    }>;
  };
}

export class DashboardService {
  async getMetrics(timeZone = 'UTC'): Promise<DashboardMetrics> {
    const totalEmployees = await prisma.employee.count();
    const activeEmployees = await prisma.employee.count({
      where: { employmentStatus: 'ACTIVE' },
    });
    const onLeaveToday = await prisma.employee.count({
      where: { employmentStatus: 'ON_LEAVE' },
    });

    // Departments with employee counts
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { employees: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const departmentDistribution = departments.map((dept) => {
      const count = dept._count.employees;
      const percentage = totalEmployees > 0 ? Math.round((count / totalEmployees) * 100) : 0;
      return {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        employeeCount: count,
        percentage,
      };
    });

    // Recent 5 employee additions
    const recentEmployees = await prisma.employee.findMany({
      take: 6,
      orderBy: { hireDate: 'desc' },
      include: {
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    });

    const recentAdditions = recentEmployees.map((emp) => ({
      id: emp.id,
      employeeCode: emp.employeeCode,
      fullName: `${emp.firstName} ${emp.lastName}`.trim(),
      workEmail: emp.workEmail,
      department: emp.department?.name || 'Unassigned',
      designation: emp.designation?.name || 'Unassigned',
      hireDate: emp.hireDate.toISOString().split('T')[0],
      employmentStatus: emp.employmentStatus,
      employmentType: emp.employmentType,
      avatarUrl: emp.avatarUrl,
    }));

    // Upcoming birthdays and work anniversaries (next 30 days)
    const activeEmps = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        hireDate: true,
        department: { select: { name: true } },
      },
    });

    const now = new Date();
    const todayParts = calendarDateInZone(now, timeZone);
    const today = dateOnlyUtc(`${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`);
    const todayUtcParts = {
      year: todayParts.year,
      month: todayParts.month - 1,
      day: todayParts.day,
    };
    const upcomingBirthdays: DashboardMetrics['upcomingEvents']['birthdays'] = [];
    const upcomingAnniversaries: DashboardMetrics['upcomingEvents']['anniversaries'] = [];

    for (const emp of activeEmps) {
      const fullName = `${emp.firstName} ${emp.lastName}`.trim();
      const department = emp.department?.name || 'General';

      // Birthday check
      if (emp.dateOfBirth) {
        const dob = new Date(emp.dateOfBirth);
        const birthdayMonth = dob.getUTCMonth();
        const birthdayDay = Math.min(dob.getUTCDate(), new Date(Date.UTC(todayParts.year, birthdayMonth + 1, 0)).getUTCDate());
        const thisYearBirthday = new Date(Date.UTC(todayParts.year, birthdayMonth, birthdayDay));
        if (thisYearBirthday < today) {
          const nextYearDay = Math.min(dob.getUTCDate(), new Date(Date.UTC(todayParts.year + 1, birthdayMonth + 1, 0)).getUTCDate());
          thisYearBirthday.setUTCFullYear(todayParts.year + 1, birthdayMonth, nextYearDay);
        }
        const diffDays = Math.ceil(
          (thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays >= 0 && diffDays <= 30) {
          upcomingBirthdays.push({
            id: emp.id,
            fullName,
            department,
            date: thisYearBirthday.toISOString().split('T')[0],
            daysRemaining: diffDays,
          });
        }
      }

      // Work anniversary check
      if (emp.hireDate) {
        const hire = new Date(emp.hireDate);
        const yearsCompleted = todayParts.year - hire.getUTCFullYear();
        if (yearsCompleted > 0) {
          const anniversaryMonth = hire.getUTCMonth();
          const anniversaryDay = Math.min(hire.getUTCDate(), new Date(Date.UTC(todayParts.year, anniversaryMonth + 1, 0)).getUTCDate());
          const thisYearAnniv = new Date(Date.UTC(todayParts.year, anniversaryMonth, anniversaryDay));
          if (thisYearAnniv < today) {
            const nextYearDay = Math.min(hire.getUTCDate(), new Date(Date.UTC(todayParts.year + 1, anniversaryMonth + 1, 0)).getUTCDate());
            thisYearAnniv.setUTCFullYear(todayParts.year + 1, anniversaryMonth, nextYearDay);
          }
          const diffDays = Math.ceil(
            (thisYearAnniv.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays >= 0 && diffDays <= 30) {
            upcomingAnniversaries.push({
              id: emp.id,
              fullName,
              department,
              years: yearsCompleted,
              date: thisYearAnniv.toISOString().split('T')[0],
              daysRemaining: diffDays,
            });
          }
        }
      }
    }

    upcomingBirthdays.sort((a, b) => a.daysRemaining - b.daysRemaining);
    upcomingAnniversaries.sort((a, b) => a.daysRemaining - b.daysRemaining);

    const todayDateOnly = dateOnlyUtc(`${todayUtcParts.year}-${String(todayUtcParts.month + 1).padStart(2, '0')}-${String(todayUtcParts.day).padStart(2, '0')}`);
    const presentTodayCount = await prisma.attendanceRecord.count({
      where: {
        workDate: todayDateOnly,
        status: { in: ['PRESENT', 'LATE', 'HALF_DAY'] },
      },
    });

    return {
      summary: {
        totalEmployees,
        activeEmployees,
        onLeaveToday,
        presentToday: {
          count: presentTodayCount,
          isImplemented: true,
          status: 'Recorded today',
        },
      },
      departmentDistribution,
      recentAdditions,
      upcomingEvents: {
        birthdays: upcomingBirthdays.slice(0, 5),
        anniversaries: upcomingAnniversaries.slice(0, 5),
      },
    };
  }
}

export const dashboardService = new DashboardService();
