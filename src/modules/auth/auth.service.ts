import { prisma } from '../../database/prisma';
import { comparePassword } from '../../common/utils/hash.utils';
import { generateToken } from '../../common/utils/jwt.utils';
import { UnauthorizedError } from '../../common/errors/app.error';
import { LoginInput } from './auth.schema';

export interface UserSessionData {
  user: {
    id: string;
    email: string;
    role: {
      id: string;
      name: string;
      description: string | null;
    };
    employee: {
      id: string;
      employeeCode: string;
      firstName: string;
      lastName: string;
      workEmail: string;
      avatarUrl: string | null;
      department?: {
        id: string;
        name: string;
      } | null;
      designation?: {
        id: string;
        name: string;
      } | null;
    } | null;
    permissions: string[];
  };
  token: string;
}

export class AuthService {
  async login(
    input: LoginInput,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<UserSessionData> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        employee: {
          include: {
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      await prisma.authAudit.create({
        data: {
          action: 'LOGIN_FAILED',
          ipAddress: metadata?.ip,
          userAgent: metadata?.userAgent,
          details: `Attempted login for non-existent email: ${input.email}`,
        },
      });
      throw new UnauthorizedError('Invalid email or password provided.');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account has been deactivated. Please contact HR.');
    }

    const isMatch = await comparePassword(input.password, user.passwordHash);
    if (!isMatch) {
      await prisma.authAudit.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          ipAddress: metadata?.ip,
          userAgent: metadata?.userAgent,
          details: 'Incorrect password provided.',
        },
      });
      throw new UnauthorizedError('Invalid email or password provided.');
    }

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Record audit log
    await prisma.authAudit.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        ipAddress: metadata?.ip,
        userAgent: metadata?.userAgent,
      },
    });

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);

    const token = generateToken({
      userId: user.id,
      email: user.email,
      roleId: user.role.id,
      roleName: user.role.name,
      employeeId: user.employeeId,
      permissions,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description,
        },
        employee: user.employee
          ? {
              id: user.employee.id,
              employeeCode: user.employee.employeeCode,
              firstName: user.employee.firstName,
              lastName: user.employee.lastName,
              workEmail: user.employee.workEmail,
              avatarUrl: user.employee.avatarUrl,
              department: user.employee.department,
              designation: user.employee.designation,
            }
          : null,
        permissions,
      },
      token,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        employee: {
          include: {
            department: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, name: true, code: true } },
            reportingManager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                workEmail: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User account not found.');
    }

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      role: {
        id: user.role.id,
        name: user.role.name,
        description: user.role.description,
      },
      employee: user.employee,
      permissions,
    };
  }

  async logout(userId?: string, metadata?: { ip?: string; userAgent?: string }) {
    if (userId) {
      await prisma.authAudit.create({
        data: {
          userId,
          action: 'LOGOUT',
          ipAddress: metadata?.ip,
          userAgent: metadata?.userAgent,
        },
      });
    }
    return { success: true };
  }
}

export const authService = new AuthService();
