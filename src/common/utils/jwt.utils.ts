import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../../config/environment';

export interface JwtPayload {
  userId: string;
  email: string;
  roleId: string;
  roleName: string;
  employeeId?: string | null;
  permissions: string[];
}

export function generateToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: (config.jwt.expiresIn as SignOptions['expiresIn']) || '7d',
  };
  return jwt.sign(payload, config.jwt.secret, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}
