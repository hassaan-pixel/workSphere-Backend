import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { sendSuccess } from '../../common/utils/response.utils';
import { askAssistantSchema } from './assistant.schema';
import { assistantService } from './assistant.service';

const router = Router();

router.post(
  '/ask',
  authenticate,
  validateRequest({ body: askAssistantSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await assistantService.answer(req.body.question, req.user!);
      sendSuccess(res, result, 'Assistant response generated');
    } catch (error) {
      next(error);
    }
  }
);

export default router;