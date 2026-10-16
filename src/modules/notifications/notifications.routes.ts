import { Router, Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { authenticate } from '../../common/middleware/auth.middleware';

const router = Router();

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const data = await notificationsService.listForUser(userId);
      sendSuccess(res, data, 'Notifications retrieved');
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      await notificationsService.markAsRead(req.params.id, userId);
      sendSuccess(res, { success: true }, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      await notificationsService.markAllAsRead(userId);
      sendSuccess(res, { success: true }, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }
);

export default router;
