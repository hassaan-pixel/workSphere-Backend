import { prisma } from '../../database/prisma';
import { NotFoundError, ConflictError } from '../../common/errors/app.error';
import { CreateHolidayInput, UpdateHolidayInput } from './holidays.schema';

export class HolidaysService {
  async listHolidays(year?: number, location?: string, departmentId?: string) {
    const where: Record<string, unknown> = { isActive: true };

    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
      where.date = { gte: startOfYear, lte: endOfYear };
    }

    if (location) {
      where.OR = [{ location: null }, { location }];
    }

    if (departmentId) {
      where.OR = [{ departmentId: null }, { departmentId }];
    }

    return prisma.holiday.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'asc' },
    });
  }

  async getHolidayById(id: string) {
    const holiday = await prisma.holiday.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });
    if (!holiday) {
      throw new NotFoundError(`Holiday with ID ${id} not found.`);
    }
    return holiday;
  }

  async createHoliday(input: CreateHolidayInput) {
    const targetDate = new Date(input.date);

    // Prevent duplicate holiday with the same name and date in the same scope
    const existing = await prisma.holiday.findFirst({
      where: {
        name: input.name,
        date: targetDate,
        location: input.location || null,
        departmentId: input.departmentId || null,
      },
    });
    if (existing) {
      throw new ConflictError(`Holiday "${input.name}" on ${input.date} already exists for this scope.`);
    }

    return prisma.holiday.create({
      data: {
        name: input.name,
        date: targetDate,
        endDate: input.endDate ? new Date(input.endDate) : null,
        description: input.description || null,
        holidayType: input.holidayType,
        location: input.location || null,
        departmentId: input.departmentId || null,
        isActive: input.isActive ?? true,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateHoliday(id: string, input: UpdateHolidayInput) {
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Holiday with ID ${id} not found.`);
    }

    return prisma.holiday.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.date ? { date: new Date(input.date) } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.holidayType ? { holidayType: input.holidayType } : {}),
        ...(input.location !== undefined ? { location: input.location || null } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async deleteHoliday(id: string) {
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Holiday with ID ${id} not found.`);
    }
    await prisma.holiday.delete({ where: { id } });
    return { id, deleted: true };
  }

  async getHolidaysInRange(startDate: Date, endDate: Date, location?: string | null, departmentId?: string | null) {
    return prisma.holiday.findMany({
      where: {
        isActive: true,
        date: { gte: startDate, lte: endDate },
        AND: [
          location ? { OR: [{ location: null }, { location }] } : {},
          departmentId ? { OR: [{ departmentId: null }, { departmentId }] } : {},
        ],
      },
    });
  }
}

export const holidaysService = new HolidaysService();
