import { Router, Request, Response, NextFunction } from 'express';
import { onboardingService } from './onboarding.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  createTemplateSchema,
  updateTemplateSchema,
  createTaskSchema,
  updateTaskStatusSchema,
  generateTasksSchema,
} from './onboarding.schema';

const router = Router();

// --- Templates ---
router.get(
  '/templates',
  authenticate,
  requirePermission('onboarding:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await onboardingService.listTemplates();
      sendSuccess(res, templates, 'Onboarding templates retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/templates',
  authenticate,
  requirePermission('onboarding:manage'),
  validateRequest({ body: createTemplateSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await onboardingService.createTemplate(req.body);
      sendSuccess(res, template, 'Onboarding template created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/templates/:id',
  authenticate,
  requirePermission('onboarding:manage'),
  validateRequest({ body: updateTemplateSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await onboardingService.updateTemplate(req.params.id, req.body);
      sendSuccess(res, template, 'Onboarding template updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

// --- Employee Tasks ---
router.get(
  '/employee/:employeeId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const checklist = await onboardingService.listTasksForEmployee(req.params.employeeId);
      sendSuccess(res, checklist, 'Employee onboarding tasks retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/employee/:employeeId/generate',
  authenticate,
  requirePermission('onboarding:manage'),
  validateRequest({ body: generateTasksSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tasks = await onboardingService.generateTasksForEmployee(
        req.params.employeeId,
        null,
        req.body.templateId
      );
      sendSuccess(res, tasks, 'Onboarding checklist generated from template', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/tasks',
  authenticate,
  requirePermission('onboarding:manage'),
  validateRequest({ body: createTaskSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await onboardingService.createTask(req.body, req.user!.id);
      sendSuccess(res, task, 'Onboarding task created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/tasks/:id/status',
  authenticate,
  validateRequest({ body: updateTaskStatusSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await onboardingService.updateTaskStatus(req.params.id, req.body, req.user!.id);
      sendSuccess(res, updated, 'Task status updated');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/tasks',
  authenticate,
  requirePermission('onboarding:manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;

      const tasks = await onboardingService.listAllTasks(status, employeeId);
      sendSuccess(res, tasks, 'All onboarding tasks retrieved');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
