import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Holidays API Tests', () => {
  let adminToken: string;
  let testHolidayId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;
  });

  afterAll(async () => {
    await prisma.holiday.deleteMany({
      where: { name: 'Founder Day Gala' },
    });
    await prisma.$disconnect();
  });

  it('POST /api/holidays should create a new holiday', async () => {
    const res = await request(app)
      .post('/api/holidays')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Founder Day Gala',
        date: '2026-10-20',
        holidayType: 'COMPANY',
        description: 'Annual corporate celebration holiday',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Founder Day Gala');
    testHolidayId = res.body.data.id;
  });

  it('POST /api/holidays should reject duplicate holiday in same scope', async () => {
    const res = await request(app)
      .post('/api/holidays')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Founder Day Gala',
        date: '2026-10-20',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/holidays should return list of active holidays', async () => {
    const res = await request(app)
      .get('/api/holidays?year=2026')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('DELETE /api/holidays/:id should delete holiday', async () => {
    const res = await request(app)
      .delete(`/api/holidays/${testHolidayId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
