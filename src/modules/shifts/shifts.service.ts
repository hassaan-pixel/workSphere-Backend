import { prisma } from '../../database/prisma';
import { NotFoundError, ConflictError, BadRequestError } from '../../common/errors/app.error';
import { CreateShiftInput, UpdateShiftInput, AssignShiftInput } from './shifts.schema';

export class ShiftsService {
  calculateWorkingHours(startTime: string, endTime: string, breakMinutes = 60) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
    let isOvernight = false;

    if (diffMinutes <= 0) {
      diffMinutes += 24 * 60; // Crosses midnight
      isOvernight = true;
    }

    const netWorkMinutes = Math.max(0, diffMinutes - breakMinutes);
    const expectedHours = Number((netWorkMinutes / 60).toFixed(2));
    return { expectedHours, isOvernight };
  }

  async listShifts(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return prisma.shift.findMany({
      where,
      include: {
        _count: { select: { assignments: true, attendanceRecords: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async getShiftById(id: string) {
    const shift = await prisma.shift.findUnique({
      where: { id },
      include: {
        assignments: {
          where: { isActive: true },
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
          },
        },
        _count: { select: { assignments: true } },
      },
    });

    if (!shift) {
      throw new NotFoundError(`Shift with ID ${id} not found.`);
    }

    return shift;
  }

  async createShift(input: CreateShiftInput) {
    const existingCode = await prisma.shift.findUnique({
      where: { code: input.code },
    });
    if (existingCode) {
      throw new ConflictError(`Shift code "${input.code}" is already in use.`);
    }

    const { expectedHours, isOvernight } = this.calculateWorkingHours(
      input.startTime,
      input.endTime,
      input.breakDurationMinutes
    );

    return prisma.shift.create({
      data: {
        code: input.code,
        name: input.name,
        startTime: input.startTime,
        endTime: input.endTime,
        breakDurationMinutes: input.breakDurationMinutes ?? 60,
        expectedHours: input.expectedHours ?? expectedHours,
        applicableDays: input.applicableDays || 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
        gracePeriodMinutes: input.gracePeriodMinutes ?? 15,
        isOvernight: input.isOvernight ?? isOvernight,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateShift(id: string, input: UpdateShiftInput) {
    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Shift with ID ${id} not found.`);
    }

    if (input.code && input.code !== existing.code) {
      const codeCheck = await prisma.shift.findUnique({ where: { code: input.code } });
      if (codeCheck) {
        throw new ConflictError(`Shift code "${input.code}" is already in use.`);
      }
    }

    const startTime = input.startTime ?? existing.startTime;
    const endTime = input.endTime ?? existing.endTime;
    const breakDuration = input.breakDurationMinutes ?? existing.breakDurationMinutes;

    const { expectedHours, isOvernight } = this.calculateWorkingHours(startTime, endTime, breakDuration);

    return prisma.shift.update({
      where: { id },
      data: {
        ...(input.code ? { code: input.code } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.startTime ? { startTime: input.startTime } : {}),
        ...(input.endTime ? { endTime: input.endTime } : {}),
        ...(input.breakDurationMinutes !== undefined ? { breakDurationMinutes: input.breakDurationMinutes } : {}),
        expectedHours: input.expectedHours ?? expectedHours,
        isOvernight: input.isOvernight ?? isOvernight,
        ...(input.applicableDays ? { applicableDays: input.applicableDays } : {}),
        ...(input.gracePeriodMinutes !== undefined ? { gracePeriodMinutes: input.gracePeriodMinutes } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async deleteShift(id: string) {
    const existing = await prisma.shift.findUnique({
      where: { id },
      include: {
        _count: { select: { assignments: true, attendanceRecords: true } },
      },
    });

    if (!existing) {
      throw new NotFoundError(`Shift with ID ${id} not found.`);
    }

    if (existing._count.assignments > 0 || existing._count.attendanceRecords > 0) {
      throw new BadRequestError(
        `Cannot delete shift "${existing.name}" — it has active employee assignments or attendance history. Set it to inactive instead.`
      );
    }

    await prisma.shift.delete({ where: { id } });
    return { id, deleted: true };
  }

  async assignShift(input: AssignShiftInput) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError(`Employee with ID ${input.employeeId} not found.`);

    const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
    if (!shift) throw new NotFoundError(`Shift with ID ${input.shiftId} not found.`);

    const newStart = new Date(input.startDate);
    const newEnd = input.endDate ? new Date(input.endDate) : null;

    if (newEnd && newEnd < newStart) {
      throw new BadRequestError('Assignment end date cannot be earlier than start date.');
    }

    // Check for conflicting active shift assignments
    const existingAssignments = await prisma.shiftAssignment.findMany({
      where: {
        employeeId: input.employeeId,
        isActive: true,
      },
    });

    for (const existing of existingAssignments) {
      const existingStart = new Date(existing.startDate);
      const existingEnd = existing.endDate ? new Date(existing.endDate) : null;

      // Overlap check
      const overlaps =
        (!newEnd || existingStart <= newEnd) &&
        (!existingEnd || existingEnd >= newStart);

      if (overlaps) {
        // If an indefinite assignment is already present, close it at the new start date
        if (!existingEnd) {
          const dayBefore = new Date(newStart);
          dayBefore.setDate(dayBefore.getDate() - 1);
          await prisma.shiftAssignment.update({
            where: { id: existing.id },
            data: { endDate: dayBefore, isActive: false },
          });
        } else {
          throw new ConflictError(
            `Employee already has an active shift assignment between ${existingStart.toISOString().substring(0, 10)} and ${existingEnd.toISOString().substring(0, 10)}.`
          );
        }
      }
    }

    return prisma.shiftAssignment.create({
      data: {
        employeeId: input.employeeId,
        shiftId: input.shiftId,
        startDate: newStart,
        endDate: newEnd,
        isActive: true,
      },
      include: {
        shift: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    });
  }

  async listEmployeeShiftHistory(employeeId: string) {
    return prisma.shiftAssignment.findMany({
      where: { employeeId },
      include: { shift: true },
      orderBy: { startDate: 'desc' },
    });
  }
}

export const shiftsService = new ShiftsService();
