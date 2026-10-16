import { Router, Request, Response, NextFunction } from 'express';
import { designationsService } from './designations.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { createDesignationSchema, updateDesignationSchema } from './designations.schema';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('designations:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
      const includeInactive = req.query.includeInactive === 'true';
      const designations = await designationsService.listDesignations(departmentId, includeInactive);
      sendSuccess(res, designations, 'Designations retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  authenticate,
  requirePermission('designations:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const designation = await designationsService.getDesignationById(req.params.id);
      sendSuccess(res, designation, 'Designation details retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requirePermission('designations:write'),
  validateRequest({ body: createDesignationSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const designation = await designationsService.createDesignation(req.body);
      sendSuccess(res, designation, 'Designation created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('designations:write'),
  validateRequest({ body: updateDesignationSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const designation = await designationsService.updateDesignation(req.params.id, req.body);
      sendSuccess(res, designation, 'Designation updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('designations:write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await designationsService.deleteDesignation(req.params.id);
      sendSuccess(res, result, 'Designation deleted successfully');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
