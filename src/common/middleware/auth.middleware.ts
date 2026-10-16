import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt.utils';
import { UnauthorizedError, ForbiddenError } from '../errors/app.error';
import { prisma } from '../../database/prisma';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  employeeId?: string | null;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check HttpOnly cookie
    if (req.cookies && (req.cookies.token || req.cookies.ws_token)) {
      token = req.cookies.token || req.cookies.ws_token;
    }

    // 2. Fall back to Authorization Header (Bearer <token>)
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
        token = parts[1];
      }
    }

    if (!token) {
      throw new UnauthorizedError('Authentication required. No session or token provided.');
    }

    // Verify token
    let payload: JwtPayload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new UnauthorizedError('Session has expired or token is invalid.');
    }

    // Check user in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
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
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account not found or deactivated.');
    }

    const permissions = user.role.rolePermissions.map((rp) => rp.permission.code);

    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
      employeeId: user.employeeId,
      permissions,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Super Admin always has full access
    if (req.user.roleName === 'Super Admin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.roleName)) {
      return next(
        new ForbiddenError(
          `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
}

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Super Admin has all permissions
    if (req.user.roleName === 'Super Admin') {
      return next();
    }

    const userPerms = new Set(req.user.permissions);
    const hasAll = requiredPermissions.every((perm) => userPerms.has(perm));

    if (!hasAll) {
      return next(
        new ForbiddenError(
          `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`
        )
      );
    }

    next();
  };
}

/**
 * IDOR Protection: Checks if the user is authorized to access/modify a specific employee record.
 * Super Admin, HR Admin, and HR Officer can access all employees.
 * Department Managers can access employees in their department.
 * Regular employees can only access their own employee record.
 */
export function scopeEmployeeAccess(employeeParam = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const targetEmployeeId = req.params[employeeParam];
      if (!targetEmployeeId) {
        return next();
      }

      // Elevated HR roles can access any employee
      const elevatedRoles = ['Super Admin', 'HR Admin', 'HR Officer'];
      if (elevatedRoles.includes(req.user.roleName)) {
        return next();
      }

      // Check if accessing own profile
      if (req.user.employeeId && req.user.employeeId === targetEmployeeId) {
        return next();
      }

      // If user is a Department Manager, check if target employee is in their department
      if (req.user.roleName === 'Department Manager' && req.user.employeeId) {
        const managerEmp = await prisma.employee.findUnique({
          where: { id: req.user.employeeId },
          select: { departmentId: true },
        });

        const targetEmp = await prisma.employee.findUnique({
          where: { id: targetEmployeeId },
          select: { departmentId: true, reportingManagerId: true },
        });

        if (
          targetEmp &&
          managerEmp &&
          (targetEmp.departmentId === managerEmp.departmentId ||
            targetEmp.reportingManagerId === req.user.employeeId)
        ) {
          return next();
        }
      }

      return next(
        new ForbiddenError('You do not have permission to access or modify this employee record.')
      );
    } catch (err) {
      next(err);
    }
  };
}
