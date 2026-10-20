import { prisma } from '../../database/prisma';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '../../common/errors/app.error';
import { PaginationParams } from '../../common/utils/pagination.utils';
import { CreateEmployeeInput, UpdateEmployeeInput } from './employees.schema';
import { provisionEmployeeAccount } from '../users/employee-account.service';
import { dateOnlyUtc } from '../../common/utils/timezone.utils';

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
        hireDateFilter.gte = dateOnlyUtc(filters.hireDateFrom);
      }
      if (filters?.hireDateTo) {
        hireDateFilter.lte = dateOnlyUtc(filters.hireDateTo);
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
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
            userPermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundError(`Employee with ID ${id} not found.`);
    }

    return employee;
  }

  async createEmployee(input: CreateEmployeeInput, actorPermissions: string[] = []) {
    const role = input.roleId
      ? await prisma.role.findUnique({
          where: { id: input.roleId },
          include: { rolePermissions: { include: { permission: true } } },
        })
      : await prisma.role.findUnique({
          where: { name: 'Employee' },
          include: { rolePermissions: { include: { permission: true } } },
        });
    if (!role) {
      throw new NotFoundError(input.roleId ? `Role with ID ${input.roleId} not found.` : 'The Employee role is not configured.');
    }

    const rolePermissionCodes = role.rolePermissions.map((rp) => rp.permission.code);
    const requestedPermissionCodes = [...new Set(input.permissionCodes || [])];
    if (requestedPermissionCodes.length) {
      const existingPermissions = await prisma.permission.findMany({
        where: { code: { in: requestedPermissionCodes } },
        select: { code: true },
      });
      if (existingPermissions.length !== requestedPermissionCodes.length) {
        throw new BadRequestError('One or more selected permissions do not exist.');
      }
    }

    const effectivePermissionCodes = [...new Set([...rolePermissionCodes, ...requestedPermissionCodes])];
    if (effectivePermissionCodes.some((code) => !actorPermissions.includes(code))) {
      throw new ForbiddenError('You cannot grant permissions that you do not have.');
    }
    const additionalPermissionCodes = requestedPermissionCodes.filter(
      (code) => !rolePermissionCodes.includes(code)
    );

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

    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          employeeCode: input.employeeCode,
          firstName: input.firstName,
          middleName: input.middleName || null,
          lastName: input.lastName,
          workEmail: input.workEmail,
          personalEmail: input.personalEmail || null,
          phone: input.phone || null,
          dateOfBirth: input.dateOfBirth ? dateOnlyUtc(input.dateOfBirth) : null,
          gender: input.gender || null,
          hireDate: dateOnlyUtc(input.hireDate),
          employmentStatus: input.employmentStatus,
          employmentType: input.employmentType,
          departmentId: input.departmentId || null,
          designationId: input.designationId || null,
          reportingManagerId: input.reportingManagerId || null,
          workLocation: input.workLocation,
          employmentEndDate: input.employmentEndDate ? dateOnlyUtc(input.employmentEndDate) : null,
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

      const credentials = await provisionEmployeeAccount(
        tx,
        employee.id,
        employee.workEmail,
        input.password,
        role.id,
        additionalPermissionCodes
      );
      return { employee, credentials };
    });
  }

  async updateEmployee(id: string, input: UpdateEmployeeInput, actorPermissions: string[] = []) {
    // Check employee exists
    const existing = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
            userPermissions: { include: { permission: true } },
          },
        },
      },
    });
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
    if (input.dateOfBirth !== undefined) updateData.dateOfBirth = input.dateOfBirth ? dateOnlyUtc(input.dateOfBirth) : null;
    if (input.gender !== undefined) updateData.gender = input.gender || null;
    if (input.hireDate !== undefined) updateData.hireDate = dateOnlyUtc(input.hireDate);
    if (input.employmentStatus !== undefined) updateData.employmentStatus = input.employmentStatus;
    if (input.employmentType !== undefined) updateData.employmentType = input.employmentType;
    if (input.departmentId !== undefined) updateData.departmentId = input.departmentId || null;
    if (input.designationId !== undefined) updateData.designationId = input.designationId || null;
    if (input.reportingManagerId !== undefined) updateData.reportingManagerId = input.reportingManagerId || null;
    if (input.workLocation !== undefined) updateData.workLocation = input.workLocation;
    if (input.employmentEndDate !== undefined) updateData.employmentEndDate = input.employmentEndDate ? dateOnlyUtc(input.employmentEndDate) : null;
    if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl || null;

    let accountRoleId: string | undefined;
    let additionalPermissionIds: string[] | undefined;
    if (input.roleId !== undefined || input.permissionCodes !== undefined) {
      if (!existing.user) {
        throw new BadRequestError('This employee does not have a login account to update.');
      }

      const role = await prisma.role.findUnique({
        where: { id: input.roleId || existing.user.roleId },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (!role) throw new NotFoundError('The selected role no longer exists.');

      const rolePermissionCodes = role.rolePermissions.map((rp) => rp.permission.code);
      const requestedPermissionCodes = [...new Set(input.permissionCodes || [])];
      const foundPermissions = requestedPermissionCodes.length
        ? await prisma.permission.findMany({
            where: { code: { in: requestedPermissionCodes } },
            select: { code: true },
          })
        : [];
      if (foundPermissions.length !== requestedPermissionCodes.length) {
        throw new BadRequestError('One or more selected permissions do not exist.');
      }

      const effectivePermissions = [...new Set([...rolePermissionCodes, ...requestedPermissionCodes])];
      const currentPermissions = new Set([
        ...(existing.user.role.rolePermissions.map((rp) => rp.permission.code)),
        ...(existing.user.userPermissions.map((up) => up.permission.code)),
      ]);
      if (effectivePermissions.some((code) => !actorPermissions.includes(code) && !currentPermissions.has(code))) {
        throw new ForbiddenError('You cannot grant permissions that you do not have.');
      }

      accountRoleId = role.id;
      const extraCodes = requestedPermissionCodes.filter((code) => !rolePermissionCodes.includes(code));
      const extraPermissions = extraCodes.length
        ? await prisma.permission.findMany({ where: { code: { in: extraCodes } }, select: { id: true } })
        : [];
      additionalPermissionIds = extraPermissions.map((permission) => permission.id);
    }

    return prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
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

      if (existing.user && accountRoleId && additionalPermissionIds !== undefined) {
        await tx.user.update({
          where: { id: existing.user.id },
          data: {
            roleId: accountRoleId,
            userPermissions: {
              deleteMany: {},
              create: additionalPermissionIds.map((permissionId) => ({ permissionId })),
            },
          },
        });
      }

      return employee;
    });
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

    await prisma.$transaction(async (tx) => {
      if (existing.directReports.length > 0) {
        await tx.employee.updateMany({
          where: { reportingManagerId: id },
          data: { reportingManagerId: null },
        });
      }

      await tx.employee.update({
        where: { id },
        data: { employmentStatus: 'TERMINATED', employmentEndDate: new Date() },
      });

      if (existing.user) {
        await tx.user.update({
          where: { id: existing.user.id },
          data: { isActive: false },
        });
      }
    });

    return { id, archived: true };
  }
}

export const employeesService = new EmployeesService();
