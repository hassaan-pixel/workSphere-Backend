import { prisma } from '../../database/prisma';
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from '../../common/errors/app.error';
import {
  CreateLeaveRequestInput,
  ReviewLeaveRequestInput,
  CancelLeaveRequestInput,
  CreateLeaveTypeInput,
  UpdateLeaveTypeInput,
  LeaveFilterInput,
} from './leave.schema';
import { holidaysService } from '../holidays/holidays.service';
import { auditService } from '../audit/audit.service';
import { notificationsService } from '../notifications/notifications.service';

export class LeaveService {
  normalizeDate(d: Date | string): Date {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate(), 0, 0, 0, 0));
  }

  async calculateLeaveDuration(
    startDate: Date,
    endDate: Date,
    location?: string | null,
    departmentId?: string | null
  ): Promise<number> {
    const holidays = await holidaysService.getHolidaysInRange(startDate, endDate, location, departmentId);
    const holidayDates = new Set(
      holidays.map((h) => this.normalizeDate(h.date).toISOString().substring(0, 10))
    );

    let workingDays = 0;
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const dayOfWeek = cur.getUTCDay();
      const dateStr = cur.toISOString().substring(0, 10);

      // Exclude Saturday (6) and Sunday (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
        workingDays++;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return workingDays;
  }

  async listLeaveTypes(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return prisma.leaveType.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async createLeaveType(input: CreateLeaveTypeInput) {
    const existing = await prisma.leaveType.findUnique({ where: { code: input.code } });
    if (existing) throw new ConflictError(`Leave type code "${input.code}" already exists.`);

    return prisma.leaveType.create({ data: input });
  }

  async updateLeaveType(id: string, input: UpdateLeaveTypeInput) {
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Leave type not found');

    return prisma.leaveType.update({ where: { id }, data: input });
  }

  async getEmployeeBalances(employeeId: string, year = new Date().getUTCFullYear()) {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
      orderBy: { leaveType: { name: 'asc' } },
    });

    return balances.map((b) => ({
      ...b,
      available: Number((b.entitlement - (b.used + b.pending)).toFixed(1)),
    }));
  }

  async requestLeave(input: CreateLeaveRequestInput, actorUserId: string, ipAddress?: string) {
    const employeeId = input.employeeId;
    if (!employeeId) throw new BadRequestError('Employee ID is required');

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { reportingManager: { include: { user: true } } },
    });
    if (!employee) throw new NotFoundError('Employee not found');

    const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!leaveType) throw new NotFoundError('Leave type not found');
    if (!leaveType.isActive) throw new BadRequestError('This leave type is currently disabled.');

    const start = this.normalizeDate(input.startDate);
    const end = this.normalizeDate(input.endDate);

    if (end < start) {
      throw new BadRequestError('Leave end date cannot be earlier than start date.');
    }

    // Calculate duration accounting for weekends and holidays
    const durationDays = await this.calculateLeaveDuration(
      start,
      end,
      employee.workLocation,
      employee.departmentId
    );

    if (durationDays === 0) {
      throw new BadRequestError('The selected dates contain only weekends or registered holidays. No leave deduction is required.');
    }

    // Check for overlapping pending or approved requests
    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        AND: [{ startDate: { lte: end } }, { endDate: { gte: start } }],
      },
      include: { leaveType: true },
    });

    if (overlapping) {
      throw new ConflictError(
        `Overlapping ${overlapping.status.toLowerCase()} leave exists for this period (${overlapping.startDate.toISOString().substring(0, 10)} to ${overlapping.endDate.toISOString().substring(0, 10)}).`
      );
    }

    // Check balance
    const year = start.getUTCFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId: input.leaveTypeId,
          year,
        },
      },
    });

    if (balance) {
      const available = balance.entitlement - (balance.used + balance.pending);
      if (available < durationDays && leaveType.isPaid) {
        throw new BadRequestError(
          `Insufficient leave balance. Requested ${durationDays} days, but only ${available} days are available.`
        );
      }
    }

    // Execute in transaction: create request & increment pending balance
    const leaveRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate: start,
          endDate: end,
          durationDays,
          reason: input.reason,
          documentUrl: input.documentUrl || null,
          status: 'PENDING',
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          leaveType: true,
        },
      });

      // Update pending balance
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pending: { increment: durationDays } },
        });
      }

      return created;
    });

    // Notify manager if exists (outside transaction)
    if (employee.reportingManager?.user) {
      await notificationsService.notify({
        userId: employee.reportingManager.user.id,
        title: 'New Leave Request for Approval',
        message: `${employee.firstName} ${employee.lastName} requested ${durationDays} day(s) of ${leaveType.name}.`,
        type: 'LEAVE',
        link: '/leave/approvals',
      }).catch((err) => console.error('Failed to notify manager:', err));
    }

    await auditService.log({
      actorId: actorUserId,
      action: 'LEAVE_REQUEST_SUBMITTED',
      entity: 'LEAVE_REQUEST',
      entityId: leaveRequest.id,
      summary: `Submitted ${durationDays} day(s) ${leaveType.name} request (${input.startDate} to ${input.endDate})`,
      ipAddress,
    }).catch((err) => console.error('Failed to log audit:', err));

    return leaveRequest;
  }

  async reviewLeave(
    requestId: string,
    input: ReviewLeaveRequestInput,
    reviewerUser: { id: string; roleName: string; employeeId?: string | null },
    ipAddress?: string
  ) {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: {
          include: {
            user: true,
            reportingManager: true,
          },
        },
        leaveType: true,
      },
    });

    if (!leaveRequest) throw new NotFoundError('Leave request not found');

    if (leaveRequest.status !== 'PENDING') {
      throw new BadRequestError(`Cannot review leave request that is already ${leaveRequest.status.toLowerCase()}.`);
    }

    // Disallow self-approval unless Super Admin
    if (reviewerUser.employeeId === leaveRequest.employeeId && reviewerUser.roleName !== 'Super Admin') {
      throw new ForbiddenError('Employees are strictly not permitted to approve their own leave applications.');
    }

    // Role check: Department manager must be reporting manager or same department
    if (reviewerUser.roleName === 'Department Manager') {
      const isManager = leaveRequest.employee.reportingManagerId === reviewerUser.employeeId;
      if (!isManager) {
        throw new ForbiddenError('You can only review leave applications submitted by your direct reporting staff.');
      }
    }

    const year = new Date(leaveRequest.startDate).getUTCFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
      },
    });

    const holidays = await holidaysService.getHolidaysInRange(
      leaveRequest.startDate,
      leaveRequest.endDate,
      leaveRequest.employee.workLocation,
      leaveRequest.employee.departmentId
    );
    const holidayDates = new Set(
      holidays.map((h) => this.normalizeDate(h.date).toISOString().substring(0, 10))
    );

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const newStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      const updatedReq = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          reviewerId: reviewerUser.id,
          reviewerComment: input.comment || null,
          reviewedAt: now,
        },
        include: { employee: true, leaveType: true, reviewer: true },
      });

      if (balance) {
        if (newStatus === 'APPROVED') {
          // Deduct from pending, add to used
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pending: { decrement: leaveRequest.durationDays },
              used: { increment: leaveRequest.durationDays },
            },
          });

          // Mark AttendanceRecords as APPROVED_LEAVE for working days in range
          const cur = new Date(leaveRequest.startDate);
          while (cur <= leaveRequest.endDate) {
            const dayOfWeek = cur.getUTCDay();
            const dateStr = cur.toISOString().substring(0, 10);
            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
              const workDate = new Date(cur);
              await tx.attendanceRecord.upsert({
                where: {
                  employeeId_workDate: {
                    employeeId: leaveRequest.employeeId,
                    workDate,
                  },
                },
                update: { status: 'APPROVED_LEAVE', notes: `Leave: ${leaveRequest.leaveType.name}` },
                create: {
                  employeeId: leaveRequest.employeeId,
                  workDate,
                  status: 'APPROVED_LEAVE',
                  notes: `Leave: ${leaveRequest.leaveType.name}`,
                },
              });
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
        } else {
          // REJECTED: decrement pending
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pending: { decrement: leaveRequest.durationDays },
            },
          });
        }
      }

      return updatedReq;
    });

    const newStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    // Notify employee of decision
    if (leaveRequest.employee.user) {
      await notificationsService.notify({
        userId: leaveRequest.employee.user.id,
        title: `Leave Request ${newStatus}`,
        message: `Your ${leaveRequest.leaveType.name} request for ${leaveRequest.durationDays} day(s) was ${newStatus.toLowerCase()}.`,
        type: 'LEAVE',
        link: '/leave/my-requests',
      }).catch((err) => console.error('Failed to notify employee:', err));
    }

    await auditService.log({
      actorId: reviewerUser.id,
      action: `LEAVE_REQUEST_${newStatus}`,
      entity: 'LEAVE_REQUEST',
      entityId: leaveRequest.id,
      summary: `Leave request for ${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName} was ${newStatus}`,
      ipAddress,
    }).catch((err) => console.error('Failed to log audit:', err));

    return updated;
  }

  async cancelLeave(requestId: string, input: CancelLeaveRequestInput, actorUserId: string, actorEmployeeId?: string | null) {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { employee: true, leaveType: true },
    });

    if (!leaveRequest) throw new NotFoundError('Leave request not found');

    if (leaveRequest.status === 'CANCELLED' || leaveRequest.status === 'REJECTED') {
      throw new BadRequestError(`Cannot cancel a leave request that is already ${leaveRequest.status.toLowerCase()}.`);
    }

    const year = new Date(leaveRequest.startDate).getUTCFullYear();
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: leaveRequest.employeeId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
      },
    });

    const updated = await prisma.$transaction(async (tx) => {
      const wasApproved = leaveRequest.status === 'APPROVED';

      const updatedReq = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          reviewerComment: input.reason ? `Cancelled: ${input.reason}` : 'Cancelled by employee',
        },
      });

      if (balance) {
        if (wasApproved) {
          // Revert used balance
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { used: { decrement: leaveRequest.durationDays } },
          });

          // Revert AttendanceRecords
          await tx.attendanceRecord.deleteMany({
            where: {
              employeeId: leaveRequest.employeeId,
              workDate: { gte: leaveRequest.startDate, lte: leaveRequest.endDate },
              status: 'APPROVED_LEAVE',
            },
          });
        } else {
          // Revert pending balance
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: { pending: { decrement: leaveRequest.durationDays } },
          });
        }
      }

      return updatedReq;
    });

    await auditService.log({
      actorId: actorUserId,
      action: 'LEAVE_REQUEST_CANCELLED',
      entity: 'LEAVE_REQUEST',
      entityId: leaveRequest.id,
      summary: `Cancelled ${leaveRequest.durationDays} day(s) leave request`,
    }).catch((err) => console.error('Failed to log audit:', err));

    return updated;
  }

  async listLeaveRequests(filters: LeaveFilterInput, user: { id: string; roleName: string; employeeId?: string | null }) {
    const where: Record<string, unknown> = {};

    // Scope filtering: Regular Employee can only view own requests
    if (user.roleName === 'Employee') {
      where.employeeId = user.employeeId || 'NO_MATCH';
    } else if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }

    if (filters.departmentId) {
      where.employee = { departmentId: filters.departmentId };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.leaveTypeId) {
      where.leaveTypeId = filters.leaveTypeId;
    }

    if (filters.startDate || filters.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.gte = this.normalizeDate(filters.startDate);
      if (filters.endDate) dateFilter.lte = this.normalizeDate(filters.endDate);
      where.startDate = dateFilter;
    }

    const skip = (filters.page - 1) * filters.limit;

    const [items, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          leaveType: true,
          reviewer: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return { items, total, page: filters.page, limit: filters.limit };
  }

  async listTeamPendingLeaves(managerEmployeeId: string) {
    return prisma.leaveRequest.findMany({
      where: {
        status: 'PENDING',
        employee: {
          reportingManagerId: managerEmployeeId,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { name: true } },
          },
        },
        leaveType: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getLeaveCalendar(startDate: string, endDate: string, departmentId?: string) {
    const start = this.normalizeDate(startDate);
    const end = this.normalizeDate(endDate);

    const where: Record<string, unknown> = {
      status: 'APPROVED',
      startDate: { lte: end },
      endDate: { gte: start },
    };

    if (departmentId) {
      where.employee = { departmentId };
    }

    return prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { name: true } },
          },
        },
        leaveType: true,
      },
      orderBy: { startDate: 'asc' },
    });
  }
}

export const leaveService = new LeaveService();
