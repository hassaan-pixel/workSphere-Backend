import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Notifications API Tests', () => {
  let adminToken: string;
  let adminUserId: string;
  let notificationId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;
    adminUserId = loginRes.body.data.user.id;

    // Create a test notification directly
    const notif = await prisma.notification.create({
      data: {
        userId: adminUserId,
        title: 'System Alert Test',
        message: 'This is a test notification payload',
        type: 'SYSTEM',
      },
    });
    notificationId = notif.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: adminUserId },
    });
    await prisma.$disconnect();
  });

  it('GET /api/notifications should return notifications and unreadCount', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('unreadCount');
    expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it('PATCH /api/notifications/:id/read should mark notification as read', async () => {
    const res = await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await prisma.notification.findUnique({ where: { id: notificationId } });
    expect(updated?.isRead).toBe(true);
  });
});
