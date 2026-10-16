import { prisma } from '../../database/prisma';
import { NotFoundError, ConflictError, BadRequestError } from '../../common/errors/app.error';
import { CreateDesignationInput, UpdateDesignationInput } from './designations.schema';

export class DesignationsService {
  async listDesignations(departmentId?: string, includeInactive = false) {
    const where: Record<string, unknown> = {};
    if (!includeInactive) {
      where.isActive = true;
    }
    if (departmentId) {
      where.departmentId = departmentId;
    }

    const designations = await prisma.designation.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });

    return designations;
  }

  async getDesignationById(id: string) {
    const designation = await prisma.designation.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        employees: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            employmentStatus: true,
            department: { select: { id: true, name: true } },
          },
          orderBy: { lastName: 'asc' },
        },
        _count: { select: { employees: true } },
      },
    });

    if (!designation) {
      throw new NotFoundError(`Designation with ID ${id} not found.`);
    }

    return designation;
  }

  async createDesignation(input: CreateDesignationInput) {
    const existingCode = await prisma.designation.findUnique({
      where: { code: input.code },
    });
    if (existingCode) {
      throw new ConflictError(`Designation code "${input.code}" is already in use.`);
    }

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) {
        throw new NotFoundError(`Department with ID ${input.departmentId} not found.`);
      }
    }

    const designation = await prisma.designation.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description || null,
        departmentId: input.departmentId || null,
        isActive: input.isActive ?? true,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true } },
      },
    });

    return designation;
  }

  async updateDesignation(id: string, input: UpdateDesignationInput) {
    const existing = await prisma.designation.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Designation with ID ${id} not found.`);
    }

    if (input.code && input.code !== existing.code) {
      const existingCode = await prisma.designation.findUnique({
        where: { code: input.code },
      });
      if (existingCode) {
        throw new ConflictError(`Designation code "${input.code}" is already in use.`);
      }
    }

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) {
        throw new NotFoundError(`Department with ID ${input.departmentId} not found.`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (input.code !== undefined) updateData.code = input.code;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description || null;
    if (input.departmentId !== undefined) updateData.departmentId = input.departmentId || null;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const designation = await prisma.designation.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { employees: true } },
      },
    });

    return designation;
  }

  async deleteDesignation(id: string) {
    const existing = await prisma.designation.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: true } },
      },
    });
    if (!existing) {
      throw new NotFoundError(`Designation with ID ${id} not found.`);
    }

    if (existing._count.employees > 0) {
      throw new BadRequestError(
        `Cannot delete designation "${existing.name}" — it still has ${existing._count.employees} employee(s) assigned. Reassign them first.`
      );
    }

    await prisma.designation.delete({ where: { id } });

    return { id, deleted: true };
  }
}

export const designationsService = new DesignationsService();
