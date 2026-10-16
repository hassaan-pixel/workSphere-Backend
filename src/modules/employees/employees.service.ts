import { prisma } from '../../database/prisma';
import { NotFoundError, ConflictError } from '../../common/errors/app.error';
import { PaginationParams } from '../../common/utils/pagination.utils';
import { CreateEmployeeInput, UpdateEmployeeInput } from './employees.schema';

export interface EmployeeFilters {
  departmentId?: string;
  designationId?: string;
  status?: string;
  employmentType?: string;
  hireDateFrom?: string;
  hireDateTo?: string;
}

export class EmployeesService {
  async listEmployees(
    params: PaginationParams,
    filters?: EmployeeFilters
  ) {
    const where: Record<string, unknown> = {};

    if (filters?.departmentId) {
      where.departmentId = filters.departmentId;
    }
    if (filters?.designationId) {
      where.designationId = filters.designationId;
    }
    if (filters?.status) {
      where.employmentStatus = filters.status;
    }
    if (filters?.employmentType) {
      where.employmentType = filters.employmentType;
    }

    // Hire date range filter
    if (filters?.hireDateFrom || filters?.hireDateTo) {
      const hireDateFilter: Record<string, Date> = {};
      if (filters?.hireDateFrom) {
        hireDateFilter.gte = new Date(filters.hireDateFrom);
      }
      if (filters?.hireDateTo) {
        hireDateFilter.lte = new Date(filters.hireDateTo);
      }
      where.hireDate = hireDateFilter;
    }

    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search } },
        { lastName: { contains: params.search } },
        { employeeCode: { contains: params.search } },
        { workEmail: { contains: params.search } },
        { phone: { contains: params.search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip: params.skip,
        take: params.limit,
        orderBy: params.sortBy
          ? { [params.sortBy]: params.sortOrder }
          : { createdAt: 'desc' },
        include: {
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, code: true } },
          reportingManager: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    return { items, total };
  }

  async getEmployeeById(id: string) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        designation: true,
        reportingManager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            employeeCode: true,
          },
        },
        directReports: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            employeeCode: true,
            designation: { select: { name: true } },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            lastLoginAt: true,
            role: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundError(`Employee with ID ${id} not found.`);
    }

    return employee;
  }

  async createEmployee(input: CreateEmployeeInput) {
    // Check for unique employee code
    const existingCode = await prisma.employee.findUnique({
      where: { employeeCode: input.employeeCode },
    });
    if (existingCode) {
      throw new ConflictError(`Employee code "${input.employeeCode}" is already in use.`);
    }

    // Check for unique work email
    const existingEmail = await prisma.employee.findUnique({
      where: { workEmail: input.workEmail },
    });
    if (existingEmail) {
      throw new ConflictError(`Work email "${input.workEmail}" is already in use.`);
    }

    // Validate department exists if specified
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) {
        throw new NotFoundError(`Department with ID ${input.departmentId} not found.`);
      }
    }

    // Validate designation exists if specified
    if (input.designationId) {
      const desig = await prisma.designation.findUnique({ where: { id: input.designationId } });
      if (!desig) {
        throw new NotFoundError(`Designation with ID ${input.designationId} not found.`);
      }
    }

    // Validate reporting manager exists if specified
    if (input.reportingManagerId) {
      const manager = await prisma.employee.findUnique({ where: { id: input.reportingManagerId } });
      if (!manager) {
        throw new NotFoundError(`Reporting manager with ID ${input.reportingManagerId} not found.`);
      }
    }

    const employee = await prisma.employee.create({
      data: {
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        middleName: input.middleName || null,
        lastName: input.lastName,
        workEmail: input.workEmail,
        personalEmail: input.personalEmail || null,
        phone: input.phone || null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: input.gender || null,
        hireDate: new Date(input.hireDate),
        employmentStatus: input.employmentStatus,
        employmentType: input.employmentType,
        departmentId: input.departmentId || null,
        designationId: input.designationId || null,
        reportingManagerId: input.reportingManagerId || null,
        workLocation: input.workLocation,
        employmentEndDate: input.employmentEndDate ? new Date(input.employmentEndDate) : null,
        avatarUrl: input.avatarUrl || null,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return employee;
  }

  async updateEmployee(id: string, input: UpdateEmployeeInput) {
    // Check employee exists
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Employee with ID ${id} not found.`);
    }

    // Check for unique constraints if updating
    if (input.employeeCode && input.employeeCode !== existing.employeeCode) {
      const existingCode = await prisma.employee.findUnique({
        where: { employeeCode: input.employeeCode },
      });
      if (existingCode) {
        throw new ConflictError(`Employee code "${input.employeeCode}" is already in use.`);
      }
    }

    if (input.workEmail && input.workEmail !== existing.workEmail) {
      const existingEmail = await prisma.employee.findUnique({
        where: { workEmail: input.workEmail },
      });
      if (existingEmail) {
        throw new ConflictError(`Work email "${input.workEmail}" is already in use.`);
      }
    }

    // Validate foreign keys if provided
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) {
        throw new NotFoundError(`Department with ID ${input.departmentId} not found.`);
      }
    }

    if (input.designationId) {
      const desig = await prisma.designation.findUnique({ where: { id: input.designationId } });
      if (!desig) {
        throw new NotFoundError(`Designation with ID ${input.designationId} not found.`);
      }
    }

    if (input.reportingManagerId) {
      if (input.reportingManagerId === id) {
        throw new ConflictError('An employee cannot be their own reporting manager.');
      }
      const manager = await prisma.employee.findUnique({ where: { id: input.reportingManagerId } });
      if (!manager) {
        throw new NotFoundError(`Reporting manager with ID ${input.reportingManagerId} not found.`);
      }
    }

    // Build update data dynamically
    const updateData: Record<string, unknown> = {};

    if (input.employeeCode !== undefined) updateData.employeeCode = input.employeeCode;
    if (input.firstName !== undefined) updateData.firstName = input.firstName;
    if (input.middleName !== undefined) updateData.middleName = input.middleName || null;
    if (input.lastName !== undefined) updateData.lastName = input.lastName;
    if (input.workEmail !== undefined) updateData.workEmail = input.workEmail;
    if (input.personalEmail !== undefined) updateData.personalEmail = input.personalEmail || null;
    if (input.phone !== undefined) updateData.phone = input.phone || null;
    if (input.dateOfBirth !== undefined) updateData.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (input.gender !== undefined) updateData.gender = input.gender || null;
    if (input.hireDate !== undefined) updateData.hireDate = new Date(input.hireDate);
    if (input.employmentStatus !== undefined) updateData.employmentStatus = input.employmentStatus;
    if (input.employmentType !== undefined) updateData.employmentType = input.employmentType;
    if (input.departmentId !== undefined) updateData.departmentId = input.departmentId || null;
    if (input.designationId !== undefined) updateData.designationId = input.designationId || null;
    if (input.reportingManagerId !== undefined) updateData.reportingManagerId = input.reportingManagerId || null;
    if (input.workLocation !== undefined) updateData.workLocation = input.workLocation;
    if (input.employmentEndDate !== undefined) updateData.employmentEndDate = input.employmentEndDate ? new Date(input.employmentEndDate) : null;
    if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl || null;

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        reportingManager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return employee;
  }

  async deleteEmployee(id: string) {
    const existing = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { id: true } },
        directReports: { select: { id: true } },
      },
    });
    if (!existing) {
      throw new NotFoundError(`Employee with ID ${id} not found.`);
    }

    // Reassign direct reports to no manager
    if (existing.directReports.length > 0) {
      await prisma.employee.updateMany({
        where: { reportingManagerId: id },
        data: { reportingManagerId: null },
      });
    }

    // Unlink user account if exists
    if (existing.user) {
      await prisma.user.update({
        where: { id: existing.user.id },
        data: { employeeId: null },
      });
    }

    await prisma.employee.delete({ where: { id } });

    return { id, deleted: true };
  }
}

export const employeesService = new EmployeesService();
