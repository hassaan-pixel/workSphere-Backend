import { Router, Request, Response, NextFunction } from 'express';
import { shiftsService } from './shifts.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { createShiftSchema, updateShiftSchema, assignShiftSchema } from './shifts.schema';

const router = Router();

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const shifts = await shiftsService.listShifts(includeInactive);
      sendSuccess(res, shifts, 'Shifts retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shift = await shiftsService.getShiftById(req.params.id);
      sendSuccess(res, shift, 'Shift details retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requirePermission('shifts:manage'),
  validateRequest({ body: createShiftSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shift = await shiftsService.createShift(req.body);
      sendSuccess(res, shift, 'Shift created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('shifts:manage'),
  validateRequest({ body: updateShiftSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const shift = await shiftsService.updateShift(req.params.id, req.body);
      sendSuccess(res, shift, 'Shift updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('shifts:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await shiftsService.deleteShift(req.params.id);
      sendSuccess(res, result, 'Shift deleted successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/assign',
  authenticate,
  requirePermission('shifts:manage'),
  validateRequest({ body: assignShiftSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignment = await shiftsService.assignShift(req.body);
      sendSuccess(res, assignment, 'Shift assigned to employee successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/employee/:employeeId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await shiftsService.listEmployeeShiftHistory(req.params.employeeId);
      sendSuccess(res, history, 'Employee shift assignment history retrieved');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
