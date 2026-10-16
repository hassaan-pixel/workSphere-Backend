import { prisma } from '../../database/prisma';

export class ReportsService {
  async getOverview() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [employees, activeEmployees, byDepartment, attendance, leave, recruitment, onboarding, payroll, performance] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.employee.groupBy({ by: ['departmentId'], _count: { _all: true }, where: { employmentStatus: 'ACTIVE' } }),
      prisma.attendanceRecord.groupBy({ by: ['status'], _count: { _all: true }, _sum: { overtimeHours: true }, where: { workDate: today } }),
      prisma.leaveRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.candidate.groupBy({ by: ['stage'], _count: { _all: true } }),
      prisma.onboardingTask.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.payrollRun.aggregate({ _sum: { grossTotalCents: true, deductionCents: true, netTotalCents: true }, _count: { _all: true }, where: { status: 'FINALIZED' } }),
      prisma.performanceReview.groupBy({ by: ['status'], _count: { _all: true }, _avg: { overallScore: true } }),
    ]);

    const departments = await prisma.department.findMany({
      where: { id: { in: byDepartment.map((entry) => entry.departmentId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, name: true },
    });
    const departmentNames = new Map(departments.map((department) => [department.id, department.name]));

    return {
      employees: {
        total: employees,
        active: activeEmployees,
        byDepartment: byDepartment.map((entry) => ({
          name: entry.departmentId ? departmentNames.get(entry.departmentId) || 'Unassigned' : 'Unassigned',
          count: entry._count._all,
        })),
      },
      attendance: {
        byStatus: attendance.map((entry) => ({ status: entry.status, count: entry._count._all })),
        overtimeHours: attendance.reduce((sum, entry) => sum + (entry._sum.overtimeHours || 0), 0),
      },
      leave: leave.map((entry) => ({ status: entry.status, count: entry._count._all })),
      recruitment: recruitment.map((entry) => ({ stage: entry.stage, count: entry._count._all })),
      onboarding: onboarding.map((entry) => ({ status: entry.status, count: entry._count._all })),
      payroll: {
        finalizedRuns: payroll._count._all,
        grossCents: payroll._sum.grossTotalCents || 0,
        deductionCents: payroll._sum.deductionCents || 0,
        netCents: payroll._sum.netTotalCents || 0,
      },
      performance: {
        byStatus: performance.map((entry) => ({ status: entry.status, count: entry._count._all })),
        averageScore: performance.reduce((sum, entry) => sum + (entry._avg.overallScore || 0) * entry._count._all, 0) /
          Math.max(1, performance.reduce((sum, entry) => sum + entry._count._all, 0)),
      },
    };
  }

  async getHeadcountReport(departmentId?: string) {
    const where = departmentId ? { departmentId } : {};
    const [byStatus, byType, byDepartment, employees] = await Promise.all([
      prisma.employee.groupBy({ by: ['employmentStatus'], _count: { _all: true }, where }),
      prisma.employee.groupBy({ by: ['employmentType'], _count: { _all: true }, where }),
      prisma.employee.groupBy({ by: ['departmentId'], _count: { _all: true }, where }),
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          workEmail: true,
          hireDate: true,
          employmentStatus: true,
          employmentType: true,
          department: { select: { name: true } },
          designation: { select: { name: true } },
        },
        orderBy: { hireDate: 'desc' },
        take: 200,
      }),
    ]);

    const deptIds = byDepartment.map((d) => d.departmentId).filter(Boolean) as string[];
    const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
    const deptMap = new Map(depts.map((d) => [d.id, d.name]));

    return {
      total: employees.length,
      byStatus: byStatus.map((s) => ({ status: s.employmentStatus, count: s._count._all })),
      byType: byType.map((t) => ({ type: t.employmentType, count: t._count._all })),
      byDepartment: byDepartment.map((d) => ({
        name: d.departmentId ? deptMap.get(d.departmentId) || 'Unassigned' : 'Unassigned',
        count: d._count._all,
      })),
      recentHires: employees.slice(0, 20),
    };
  }

  async getAttendanceReport(startDate: string, endDate: string, departmentId?: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      workDate: { gte: start, lte: end },
    };
    if (departmentId) {
      where.employee = { departmentId };
    }

    const [byStatus, totals, records] = await Promise.all([
      prisma.attendanceRecord.groupBy({ by: ['status'], _count: { _all: true }, where }),
      prisma.attendanceRecord.aggregate({
        _sum: { workingHours: true, overtimeHours: true },
        _count: { _all: true },
        where,
      }),
      prisma.attendanceRecord.findMany({
        where,
        include: {
          employee: {
            select: {
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { workDate: 'desc' },
        take: 300,
      }),
    ]);

    return {
      periodStart: startDate,
      periodEnd: endDate,
      totalRecords: totals._count._all,
      totalHours: Number((totals._sum.workingHours || 0).toFixed(1)),
      totalOvertime: Number((totals._sum.overtimeHours || 0).toFixed(1)),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      sampleRecords: records.slice(0, 50),
    };
  }

  async getLeaveReport(year?: number, departmentId?: string) {
    const currentYear = year || new Date().getFullYear();
    const where: Record<string, unknown> = {};
    if (departmentId) {
      where.employee = { departmentId };
    }

    const [requestsByStatus, balances, leaveTypes] = await Promise.all([
      prisma.leaveRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.leaveBalance.findMany({
        where: { year: currentYear, ...(departmentId ? { employee: { departmentId } } : {}) },
        include: { leaveType: true },
      }),
      prisma.leaveType.findMany({ where: { isActive: true } }),
    ]);

    const usageByType = leaveTypes.map((type) => {
      const typeBalances = balances.filter((b) => b.leaveTypeId === type.id);
      const totalEntitlement = typeBalances.reduce((sum, b) => sum + b.entitlement, 0);
      const totalUsed = typeBalances.reduce((sum, b) => sum + b.used, 0);
      const totalPending = typeBalances.reduce((sum, b) => sum + b.pending, 0);
      return {
        name: type.name,
        code: type.code,
        entitlement: totalEntitlement,
        used: totalUsed,
        pending: totalPending,
        available: Math.max(0, totalEntitlement - totalUsed - totalPending),
      };
    });

    return {
      year: currentYear,
      requestsByStatus: requestsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
      usageByType,
    };
  }

  async getPayrollReport() {
    const [runs, activeStructures] = await Promise.all([
      prisma.payrollRun.findMany({
        include: {
          _count: { select: { entries: true } },
          createdBy: { select: { email: true } },
        },
        orderBy: { periodStart: 'desc' },
      }),
      prisma.salaryStructure.findMany({
        where: { isActive: true },
        include: {
          employee: {
            select: {
              department: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Cost by department
    const deptTotals: Record<string, number> = {};
    for (const struct of activeStructures) {
      const dept = struct.employee.department?.name || 'Unassigned';
      deptTotals[dept] = (deptTotals[dept] || 0) + struct.basicSalaryCents;
    }

    return {
      runs: runs.map((r) => ({
        id: r.id,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        currency: r.currency,
        grossTotal: (r.grossTotalCents / 100).toFixed(2),
        deductionTotal: (r.deductionCents / 100).toFixed(2),
        netTotal: (r.netTotalCents / 100).toFixed(2),
        employeeCount: r._count.entries,
      })),
      departmentDistribution: Object.entries(deptTotals).map(([dept, cents]) => ({
        department: dept,
        monthlyBaseCents: cents,
        monthlyBase: (cents / 100).toFixed(2),
      })),
    };
  }

  async getExportCsv(reportType: string, query: Record<string, string>): Promise<string> {
    if (reportType === 'headcount') {
      const data = await this.getHeadcountReport(query.departmentId);
      const rows = [
        ['Status/Metric', 'Count'],
        ...data.byStatus.map((s) => [s.status, s.count.toString()]),
        ['', ''],
        ['Department', 'Headcount'],
        ...data.byDepartment.map((d) => [d.name, d.count.toString()]),
      ];
      return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    }

    if (reportType === 'attendance') {
      const today = new Date().toISOString().substring(0, 10);
      const start = query.startDate || today;
      const end = query.endDate || today;
      const data = await this.getAttendanceReport(start, end, query.departmentId);
      const rows = [
        ['Attendance Status', 'Count'],
        ...data.byStatus.map((s) => [s.status, s.count.toString()]),
        ['', ''],
        ['Total Working Hours', data.totalHours.toString()],
        ['Total Overtime Hours', data.totalOvertime.toString()],
      ];
      return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    }

    if (reportType === 'leave') {
      const data = await this.getLeaveReport();
      const rows = [
        ['Leave Type', 'Total Entitlement', 'Days Used', 'Days Pending', 'Days Available'],
        ...data.usageByType.map((u) => [
          u.name,
          u.entitlement.toString(),
          u.used.toString(),
          u.pending.toString(),
          u.available.toString(),
        ]),
      ];
      return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    }

    if (reportType === 'payroll') {
      const data = await this.getPayrollReport();
      const rows = [
        ['Period Start', 'Period End', 'Status', 'Currency', 'Gross Pay', 'Deductions', 'Net Pay', 'Employees'],
        ...data.runs.map((r) => [
          r.periodStart.toISOString().substring(0, 10),
          r.periodEnd.toISOString().substring(0, 10),
          r.status,
          r.currency,
          r.grossTotal,
          r.deductionTotal,
          r.netTotal,
          r.employeeCount.toString(),
        ]),
      ];
      return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    }

    return 'Report,Generated\nNo data,0\n';
  }
}

export const reportsService = new ReportsService();
