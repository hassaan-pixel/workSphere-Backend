import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Designations API Tests', () => {
  let adminToken: string;
  let testDesigId: string;
  let engDeptId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;

    const engDept = await prisma.department.findUnique({ where: { code: 'ENG' } });
    engDeptId = engDept?.id || '';
  });

  afterAll(async () => {
    await prisma.designation.deleteMany({
      where: { code: { in: ['TEST_DES1', 'TEST_DES2'] } },
    });
    await prisma.$disconnect();
  });

  it('GET /api/designations should return designations with department filter support', async () => {
    const res = await request(app)
      .get(`/api/designations?departmentId=${engDeptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    res.body.data.forEach((d: any) => {
      expect(d.departmentId).toBe(engDeptId);
    });
  });

  it('POST /api/designations should create a new designation', async () => {
    const res = await request(app)
      .post('/api/designations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_DES1',
        name: 'Lead Site Reliability Engineer',
        description: 'Oversees infrastructure reliability, observability, and uptime',
        departmentId: engDeptId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('TEST_DES1');
    expect(res.body.data.name).toBe('Lead Site Reliability Engineer');
    testDesigId = res.body.data.id;
  });

  it('POST /api/designations should reject duplicate code', async () => {
    const res = await request(app)
      .post('/api/designations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_DES1',
        name: 'Another SRE Title',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/designations/:id should return details of specific designation', async () => {
    const res = await request(app)
      .get(`/api/designations/${testDesigId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testDesigId);
    expect(res.body.data.name).toBe('Lead Site Reliability Engineer');
  });

  it('PUT /api/designations/:id should update designation details', async () => {
    const res = await request(app)
      .put(`/api/designations/${testDesigId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Principal Site Reliability Engineer',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Principal Site Reliability Engineer');
  });

  it('DELETE /api/designations/:id should delete empty designation', async () => {
    const res = await request(app)
      .delete(`/api/designations/${testDesigId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
  });

  it('DELETE /api/designations/:id should block deletion if employees are assigned', async () => {
    const occupiedDesig = await prisma.designation.findFirst({
      where: { employees: { some: {} } },
      include: { _count: { select: { employees: true } } },
    });

    if (occupiedDesig) {
      const res = await request(app)
        .delete(`/api/designations/${occupiedDesig.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot delete designation');
    }
  });
});
