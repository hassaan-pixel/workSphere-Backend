import { Router } from 'express';
import { employeesController } from './employees.controller';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { createEmployeeSchema, updateEmployeeSchema } from './employees.schema';
import {
  authenticate,
  requirePermission,
  scopeEmployeeAccess,
} from '../../common/middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('employees:read'),
  (req, res, next) => employeesController.list(req, res, next)
);

router.get(
  '/:id',
  authenticate,
  requirePermission('employees:read'),
  scopeEmployeeAccess('id'),
  (req, res, next) => employeesController.getById(req, res, next)
);

router.post(
  '/',
  authenticate,
  requirePermission('employees:write'),
  validateRequest({ body: createEmployeeSchema }),
  (req, res, next) => employeesController.create(req, res, next)
);

router.put(
  '/:id',
  authenticate,
  requirePermission('employees:write'),
  scopeEmployeeAccess('id'),
  validateRequest({ body: updateEmployeeSchema }),
  (req, res, next) => employeesController.update(req, res, next)
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('employees:delete'),
  (req, res, next) => employeesController.remove(req, res, next)
);

export default router;
