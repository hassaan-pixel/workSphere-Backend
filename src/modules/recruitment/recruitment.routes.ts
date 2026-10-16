import { Router, Request, Response, NextFunction } from 'express';
import { recruitmentService } from './recruitment.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import {
  createJobOpeningSchema,
  updateJobOpeningSchema,
  createCandidateSchema,
  transitionStageSchema,
  hireCandidateSchema,
} from './recruitment.schema';

const router = Router();

// --- Job Openings ---
router.get(
  '/openings',
  authenticate,
  requirePermission('recruitment:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;

      const openings = await recruitmentService.listOpenings(status, departmentId);
      sendSuccess(res, openings, 'Job openings retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/openings/:id',
  authenticate,
  requirePermission('recruitment:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const opening = await recruitmentService.getOpeningById(req.params.id);
      sendSuccess(res, opening, 'Job opening details retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/openings',
  authenticate,
  requirePermission('recruitment:write'),
  validateRequest({ body: createJobOpeningSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const opening = await recruitmentService.createOpening(req.body, req.user!.id);
      sendSuccess(res, opening, 'Job opening created successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/openings/:id',
  authenticate,
  requirePermission('recruitment:write'),
  validateRequest({ body: updateJobOpeningSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const opening = await recruitmentService.updateOpening(req.params.id, req.body, req.user!.id);
      sendSuccess(res, opening, 'Job opening updated successfully');
    } catch (error) {
      next(error);
    }
  }
);

// --- Candidates ---
router.get(
  '/candidates',
  authenticate,
  requirePermission('recruitment:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobOpeningId = typeof req.query.jobOpeningId === 'string' ? req.query.jobOpeningId : undefined;
      const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined;

      const candidates = await recruitmentService.listCandidates(jobOpeningId, stage);
      sendSuccess(res, candidates, 'Candidates retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/candidates/:id',
  authenticate,
  requirePermission('recruitment:read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const candidate = await recruitmentService.getCandidateById(req.params.id);
      sendSuccess(res, candidate, 'Candidate details retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/candidates',
  authenticate,
  requirePermission('recruitment:write'),
  validateRequest({ body: createCandidateSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const candidate = await recruitmentService.apply(req.body);
      sendSuccess(res, candidate, 'Candidate application registered successfully', 201);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/candidates/:id/stage',
  authenticate,
  requirePermission('recruitment:write'),
  validateRequest({ body: transitionStageSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const candidate = await recruitmentService.transitionStage(req.params.id, req.body, req.user!.id);
      sendSuccess(res, candidate, `Candidate stage transitioned to ${req.body.toStage}`);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/candidates/:id/hire',
  authenticate,
  requirePermission('recruitment:write'),
  validateRequest({ body: hireCandidateSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await recruitmentService.hireCandidate(req.params.id, req.body, req.user!.id);
      sendSuccess(res, result, 'Candidate successfully hired and registered as Employee', 201);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
