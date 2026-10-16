import { Router, Request, Response, NextFunction } from 'express';
import { holidaysService } from './holidays.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { createHolidaySchema, updateHolidaySchema } from './holidays.schema';

const router = Router();

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const location = typeof req.query.location === 'string' ? req.query.location : undefined;
      const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;

      const holidays = await holidaysService.listHolidays(year, location, departmentId);
      sendSuccess(res, holidays, 'Holidays retrieved successfully');
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
      const holiday = await holidaysService.getHolidayById(req.params.id);
      sendSuccess(res, holiday, 'Holiday details retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticate,
  requirePermission('holidays:manage'),
  validateRequest({ body: createHolidaySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const holiday = await holidaysService.createHoliday(req.body);
      sendSuccess(res, holiday, 'Holiday created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('holidays:manage'),
  validateRequest({ body: updateHolidaySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const holiday = await holidaysService.updateHoliday(req.params.id, req.body);
      sendSuccess(res, holiday, 'Holiday updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('holidays:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await holidaysService.deleteHoliday(req.params.id);
      sendSuccess(res, result, 'Holiday deleted successfully');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
