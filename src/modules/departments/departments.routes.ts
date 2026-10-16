import { Router, Request, Response, NextFunction } from 'express';
import { departmentsService } from './departments.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { createDepartmentSchema, updateDepartmentSchema } from './departments.schema';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('departments:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const departments = await departmentsService.listDepartments(includeInactive);
      sendSuccess(res, departments, 'Departments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  authenticate,
  requirePermission('departments:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const department = await departmentsService.getDepartmentById(req.params.id);
      sendSuccess(res, department, 'Department details retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requirePermission('departments:write'),
  validateRequest({ body: createDepartmentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const department = await departmentsService.createDepartment(req.body);
      sendSuccess(res, department, 'Department created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('departments:write'),
  validateRequest({ body: updateDepartmentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const department = await departmentsService.updateDepartment(req.params.id, req.body);
      sendSuccess(res, department, 'Department updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('departments:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await departmentsService.deleteDepartment(req.params.id);
      sendSuccess(res, result, 'Department deleted successfully');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
