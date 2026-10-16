import { prisma } from '../../database/prisma';
import { NotFoundError, ConflictError, BadRequestError } from '../../common/errors/app.error';
import { CreateDepartmentInput, UpdateDepartmentInput } from './departments.schema';

export class DepartmentsService {
  async listDepartments(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    const departments = await prisma.department.findMany({
      where,
      include: {
        _count: {
          select: { employees: true, designations: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return departments;
  }

  async getDepartmentById(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        designations: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            isActive: true,
            _count: { select: { employees: true } },
          },
          orderBy: { name: 'asc' },
        },
        employees: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            employmentStatus: true,
            designation: { select: { id: true, name: true } },
          },
          orderBy: { lastName: 'asc' },
        },
        _count: {
          select: { employees: true, designations: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundError(`Department with ID ${id} not found.`);
    }

    return department;
  }

  async createDepartment(input: CreateDepartmentInput) {
    const existingCode = await prisma.department.findUnique({
      where: { code: input.code },
    });
    if (existingCode) {
      throw new ConflictError(`Department code "${input.code}" is already in use.`);
    }

    const department = await prisma.department.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description || null,
        isActive: input.isActive ?? true,
      },
      include: {
        _count: {
          select: { employees: true, designations: true },
        },
      },
    });

    return department;
  }

  async updateDepartment(id: string, input: UpdateDepartmentInput) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Department with ID ${id} not found.`);
    }

    if (input.code && input.code !== existing.code) {
      const existingCode = await prisma.department.findUnique({
        where: { code: input.code },
      });
      if (existingCode) {
        throw new ConflictError(`Department code "${input.code}" is already in use.`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (input.code !== undefined) updateData.code = input.code;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description || null;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const department = await prisma.department.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { employees: true, designations: true },
        },
      },
    });

    return department;
  }

  async deleteDepartment(id: string) {
    const existing = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: true, designations: true } },
      },
    });
    if (!existing) {
      throw new NotFoundError(`Department with ID ${id} not found.`);
    }

    if (existing._count.employees > 0) {
      throw new BadRequestError(
        `Cannot delete department "${existing.name}" — it still has ${existing._count.employees} employee(s) assigned. Reassign them first.`
      );
    }

    // Unlink designations
    await prisma.designation.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });

    await prisma.department.delete({ where: { id } });

    return { id, deleted: true };
  }
}

export const departmentsService = new DepartmentsService();
