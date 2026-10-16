import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '../../common/utils/response.utils';
import { config } from '../../config/environment';

export class AuthController {
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.changePassword(req.user!.id, req.body, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendSuccess(res, { changed: true }, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Set secure HttpOnly cookie
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: config.env === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user) {
        await authService.logout(req.user.id, {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      // Clear cookie
      res.clearCookie('token', {
        httpOnly: true,
        sameSite: 'lax',
      });

      sendSuccess(res, { loggedOut: true }, 'Successfully logged out');
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
        return;
      }

      const currentUser = await authService.getCurrentUser(req.user.id);
      sendSuccess(res, currentUser, 'Current user profile retrieved');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
