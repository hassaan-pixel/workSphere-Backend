import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Onboarding Management API Tests', () => {
  let adminToken: string;
  let employeeId: string;
  let taskId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;

    const emp = await prisma.employee.findFirst({ where: { employeeCode: 'EMP-002' } });
    employeeId = emp?.id || '';
  });

  afterAll(async () => {
    await prisma.onboardingTask.deleteMany({
      where: { employeeId },
    });
    await prisma.$disconnect();
  });

  it('GET /api/onboarding/templates should list available onboarding templates', async () => {
    const res = await request(app)
      .get('/api/onboarding/templates')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /api/onboarding/employee/:employeeId/generate should instantiate checklist', async () => {
    const res = await request(app)
      .post(`/api/onboarding/employee/${employeeId}/generate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    taskId = res.body.data[0].id;
  });

  it('GET /api/onboarding/employee/:employeeId should calculate progress stats', async () => {
    const res = await request(app)
      .get(`/api/onboarding/employee/${employeeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('tasks');
    expect(res.body.data).toHaveProperty('stats');
    expect(res.body.data.stats).toHaveProperty('total');
    expect(res.body.data.stats).toHaveProperty('completed');
    expect(res.body.data.stats).toHaveProperty('progressPercent');
  });

  it('PATCH /api/onboarding/tasks/:id/status should mark task as COMPLETED with completion date', async () => {
    const res = await request(app)
      .patch(`/api/onboarding/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'COMPLETED',
        notes: 'Verified laptop serial number and activated credentials',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.completionDate).toBeDefined();
  });
});
