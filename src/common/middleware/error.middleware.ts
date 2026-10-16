import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app.error';
import { sendError } from '../utils/response.utils';
import { config } from '../../config/environment';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): Response {
  if (config.env !== 'test') {
    console.error(`[Error] ${err.name}: ${err.message}`, {
      path: req.originalUrl,
      method: req.method,
      stack: config.env === 'development' ? err.stack : undefined,
    });
  }

  // Handle known AppError
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.code, err.details);
  }

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return sendError(
        res,
        `A record with this ${target} already exists.`,
        409,
        'DUPLICATE_ENTRY',
        { fields: err.meta?.target }
      );
    }
    if (err.code === 'P2025') {
      return sendError(res, 'The requested resource was not found.', 404, 'NOT_FOUND');
    }
    return sendError(res, 'Database operation failed.', 400, 'DATABASE_ERROR', {
      code: err.code,
    });
  }

  // Handle JSON Syntax Error (Malformed request body)
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    return sendError(res, 'Malformed JSON payload provided.', 400, 'INVALID_JSON');
  }

  // Unknown / unhandled internal errors
  const isDev = config.env === 'development';
  return sendError(
    res,
    isDev ? err.message : 'An unexpected internal server error occurred.',
    500,
    'INTERNAL_SERVER_ERROR',
    isDev ? { stack: err.stack } : undefined
  );
}

export function notFoundHandler(req: Request, res: Response): Response {
  return sendError(res, `Route ${req.method} ${req.originalUrl} not found.`, 404, 'NOT_FOUND');
}
