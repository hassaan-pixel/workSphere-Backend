import { prisma } from '../../database/prisma';
import { NotFoundError, BadRequestError } from '../../common/errors/app.error';
import { ManualAttendanceInput, AttendanceFilterInput } from './attendance.schema';
import { auditService } from '../audit/audit.service';

export class AttendanceService {
  normalizeDate(d: Date | string): Date {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), 0, 0, 0, 0));
  }

  async getActiveShiftForEmployee(employeeId: string, date: Date) {
    const assignment = await prisma.shiftAssignment.findFirst({
      where: {
        employeeId,
        isActive: true,
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      include: { shift: true },
      orderBy: { startDate: 'desc' },
    });

    if (assignment?.shift) {
      return assignment.shift;
    }

    // Fallback to standard shift if none assigned
    return prisma.shift.findFirst({ where: { code: 'MORN_STD' } });
  }

  async clockIn(employeeId: string, notes?: string, actorId?: string, ipAddress?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundError('Employee not found');

    const now = new Date();
    const workDate = this.normalizeDate(now);
    const shift = await this.getActiveShiftForEmployee(employeeId, workDate);

    // Determine if late compared to shift start + grace
    let status = 'PRESENT';
    if (shift) {
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const grace = shift.gracePeriodMinutes || 15;
      const shiftStartInMins = sh * 60 + sm + grace;
      const currentMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (currentMins > shiftStartInMins && !shift.isOvernight) {
        status = 'LATE';
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let record = await tx.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
      });

      if (!record) {
        record = await tx.attendanceRecord.create({
          data: {
            employeeId,
            workDate,
            shiftId: shift?.id || null,
            checkInTime: now,
            status,
            notes: notes || null,
          },
        });
      } else {
        // If existing record was absent, update status
        if (record.status === 'ABSENT') {
          record = await tx.attendanceRecord.update({
            where: { id: record.id },
            data: { status, checkInTime: record.checkInTime || now },
          });
        }
      }

      // Check if there is an unclosed session
      const openSession = await tx.attendanceSession.findFirst({
        where: { attendanceRecordId: record.id, clockOut: null },
      });

      if (openSession) {
        throw new BadRequestError('You are already clocked in. Please clock out before clocking in again.');
      }

      const session = await tx.attendanceSession.create({
        data: {
          attendanceRecordId: record.id,
          clockIn: now,
        },
      });

      return { record, session };
    });

    await auditService.log({
      actorId,
      action: 'CLOCK_IN',
      entity: 'ATTENDANCE',
      entityId: result.record.id,
      summary: `Employee ${employee.employeeCode} clocked in at ${now.toISOString()}`,
      ipAddress,
    });

    return result;
  }

  async clockOut(employeeId: string, notes?: string, actorId?: string, ipAddress?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundError('Employee not found');

    const now = new Date();
    const workDate = this.normalizeDate(now);

    const updatedRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
        include: { shift: true, sessions: true },
      });

      if (!record) {
        throw new BadRequestError('No clock-in record found for today. Please clock in first.');
      }

      const openSession = await tx.attendanceSession.findFirst({
        where: { attendanceRecordId: record.id, clockOut: null },
        orderBy: { clockIn: 'desc' },
      });

      if (!openSession) {
        throw new BadRequestError('No active clock-in session found to clock out from.');
      }

      // Close the open session
      const durationMinutes = Math.max(0, Math.round((now.getTime() - new Date(openSession.clockIn).getTime()) / 60000));
      await tx.attendanceSession.update({
        where: { id: openSession.id },
        data: {
          clockOut: now,
          durationMinutes,
        },
      });

      // Sum all completed sessions
      const allSessions = await tx.attendanceSession.findMany({
        where: { attendanceRecordId: record.id },
      });

      let totalMinutes = 0;
      allSessions.forEach((s) => {
        if (s.id === openSession.id) {
          totalMinutes += durationMinutes;
        } else if (s.durationMinutes) {
          totalMinutes += s.durationMinutes;
        }
      });

      const workingHours = Number((totalMinutes / 60).toFixed(2));
      const expected = record.shift?.expectedHours || 8.0;
      const overtimeHours = workingHours > expected ? Number((workingHours - expected).toFixed(2)) : 0;

      let status = record.status;
      if (workingHours < expected / 2 && status !== 'APPROVED_LEAVE') {
        status = 'HALF_DAY';
      }

      return tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          checkOutTime: now,
          workingHours,
          overtimeHours,
          status,
          notes: notes ? (record.notes ? `${record.notes}; ${notes}` : notes) : record.notes,
        },
      });
    });

    await auditService.log({
      actorId,
      action: 'CLOCK_OUT',
      entity: 'ATTENDANCE',
      entityId: updatedRecord.id,
      summary: `Employee ${employee.employeeCode} clocked out at ${now.toISOString()} (${updatedRecord.workingHours} hrs worked)`,
      ipAddress,
    });

    return updatedRecord;
  }

  async recordManualAttendance(input: ManualAttendanceInput, actorId: string, ipAddress?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employee not found');

    const workDate = this.normalizeDate(input.workDate);

    const checkInTime = input.checkInTime ? new Date(input.checkInTime) : null;
    const checkOutTime = input.checkOutTime ? new Date(input.checkOutTime) : null;

    let workingHours = input.workingHours;
    if (workingHours === undefined && checkInTime && checkOutTime) {
      const diffMs = checkOutTime.getTime() - checkInTime.getTime();
      workingHours = Number((Math.max(0, diffMs) / (1000 * 60 * 60)).toFixed(2));
    }

    const record = await prisma.$transaction(async (tx) => {
      return tx.attendanceRecord.upsert({
        where: {
          employeeId_workDate: {
            employeeId: input.employeeId,
            workDate,
          },
        },
        update: {
          status: input.status,
          shiftId: input.shiftId || null,
          checkInTime,
          checkOutTime,
          workingHours: workingHours ?? 0,
          overtimeHours: input.overtimeHours ?? 0,
          isManualEntry: true,
          correctionReason: input.correctionReason,
          notes: input.notes || null,
        },
        create: {
          employeeId: input.employeeId,
          workDate,
          status: input.status,
          shiftId: input.shiftId || null,
          checkInTime,
          checkOutTime,
          workingHours: workingHours ?? 0,
          overtimeHours: input.overtimeHours ?? 0,
          isManualEntry: true,
          correctionReason: input.correctionReason,
          notes: input.notes || null,
        },
      });
    });

    await auditService.log({
      actorId,
      action: 'MANUAL_ATTENDANCE_ENTRY',
      entity: 'ATTENDANCE',
      entityId: record.id,
      summary: `Manual attendance for ${employee.employeeCode} on ${input.workDate}: ${input.status} (${input.correctionReason})`,
      ipAddress,
    });

    return record;
  }

  async listAttendance(filters: AttendanceFilterInput) {
    const where: Record<string, unknown> = {};

    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }

    if (filters.departmentId) {
      where.employee = { departmentId: filters.departmentId };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.gte = this.normalizeDate(filters.startDate);
      if (filters.endDate) dateFilter.lte = this.normalizeDate(filters.endDate);
      where.workDate = dateFilter;
    }

    const skip = (filters.page - 1) * filters.limit;

    const [items, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { workDate: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              workEmail: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
          sessions: { orderBy: { clockIn: 'asc' } },
        },
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    return { items, total, page: filters.page, limit: filters.limit };
  }

  async getAttendanceSummary(departmentId?: string, startDate?: string, endDate?: string, employeeId?: string) {
    const where: Record<string, unknown> = {};
    if (employeeId) {
      where.employeeId = employeeId;
    }
    if (departmentId) {
      where.employee = { departmentId };
    }
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = this.normalizeDate(startDate);
      if (endDate) dateFilter.lte = this.normalizeDate(endDate);
      where.workDate = dateFilter;
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: { status: true, workingHours: true, overtimeHours: true },
    });

    const summary = {
      totalRecords: records.length,
      present: 0,
      presentCount: 0,
      late: 0,
      lateCount: 0,
      halfDay: 0,
      halfDayCount: 0,
      absent: 0,
      absentCount: 0,
      onLeave: 0,
      onLeaveCount: 0,
      totalHours: 0,
      totalHoursWorked: 0,
      totalOvertime: 0,
      totalOvertimeHours: 0,
      averageHours: 0,
    };

    records.forEach((r) => {
      if (r.status === 'PRESENT') { summary.present++; summary.presentCount++; }
      else if (r.status === 'LATE') { summary.late++; summary.lateCount++; }
      else if (r.status === 'HALF_DAY') { summary.halfDay++; summary.halfDayCount++; }
      else if (r.status === 'ABSENT') { summary.absent++; summary.absentCount++; }
      else if (r.status === 'APPROVED_LEAVE') { summary.onLeave++; summary.onLeaveCount++; }

      summary.totalHours += (r.workingHours || 0);
      summary.totalOvertime += (r.overtimeHours || 0);
    });

    summary.totalHours = Number(summary.totalHours.toFixed(2));
    summary.totalHoursWorked = summary.totalHours;
    summary.totalOvertime = Number(summary.totalOvertime.toFixed(2));
    summary.totalOvertimeHours = summary.totalOvertime;
    summary.averageHours = records.length > 0 ? Number((summary.totalHours / records.length).toFixed(2)) : 0;

    return summary;
  }

  async getMonthlyView(employeeId: string, year: number, month: number) {
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const records = await prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        workDate: { gte: startOfMonth, lte: endOfMonth },
      },
      include: {
        shift: true,
        sessions: true,
      },
      orderBy: { workDate: 'asc' },
    });

    return records;
  }

  async exportCsv(filters: AttendanceFilterInput): Promise<string> {
    const { items } = await this.listAttendance({ ...filters, limit: 1000, page: 1 });

    const headers = [
      'Date',
      'Employee Code',
      'Name',
      'Department',
      'Shift',
      'Status',
      'Check In',
      'Check Out',
      'Working Hours',
      'Overtime Hours',
      'Manual Entry',
      'Correction Reason',
    ];

    const rows = items.map((rec) => [
      new Date(rec.workDate).toISOString().substring(0, 10),
      rec.employee.employeeCode,
      `"${rec.employee.firstName} ${rec.employee.lastName}"`,
      `"${rec.employee.department?.name || 'N/A'}"`,
      `"${rec.shift?.name || 'N/A'}"`,
      rec.status,
      rec.checkInTime ? new Date(rec.checkInTime).toISOString().substring(11, 19) : '',
      rec.checkOutTime ? new Date(rec.checkOutTime).toISOString().substring(11, 19) : '',
      rec.workingHours,
      rec.overtimeHours,
      rec.isManualEntry ? 'Yes' : 'No',
      `"${rec.correctionReason || ''}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const attendanceService = new AttendanceService();
