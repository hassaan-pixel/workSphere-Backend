import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { ConflictError } from '../../common/errors/app.error';
import { hashPassword } from '../../common/utils/hash.utils';

export interface EmployeeLoginCredentials {
  email: string;
  temporaryPassword: string;
}

export async function provisionEmployeeAccount(
  tx: Prisma.TransactionClient,
  employeeId: string,
  email: string,
  initialPassword?: string
): Promise<EmployeeLoginCredentials> {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    throw new ConflictError(`A login account with email "${normalizedEmail}" already exists.`);
  }

  const employeeRole = await tx.role.findUnique({ where: { name: 'Employee' } });
  if (!employeeRole) {
    throw new Error('The Employee role is not configured.');
  }

  const temporaryPassword = initialPassword ?? randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);

  await tx.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      roleId: employeeRole.id,
      employeeId,
      isActive: true,
    },
  });

  return { email: normalizedEmail, temporaryPassword };
}