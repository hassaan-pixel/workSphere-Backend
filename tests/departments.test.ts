import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Departments API Tests', () => {
  let adminToken: string;
  let testDeptId: string;

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
    // Cleanup any lingering test departments
    await prisma.department.deleteMany({
      where: { code: { in: ['TEST_D1', 'TEST_D2', 'TEST_UPD'] } },
    });
    await prisma.$disconnect();
  });

  it('GET /api/departments should return list of active departments', async () => {
    const res = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('_count');
    expect(res.body.data[0]._count).toHaveProperty('employees');
    expect(res.body.data[0]._count).toHaveProperty('designations');
  });

  it('POST /api/departments should create a new department', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_D1',
        name: 'Quality Assurance Testing',
        description: 'Software QA and manual verification division',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('TEST_D1');
    expect(res.body.data.name).toBe('Quality Assurance Testing');
    testDeptId = res.body.data.id;
  });

  it('POST /api/departments should reject duplicate department code', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_D1',
        name: 'Another QA Team',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/departments/:id should return detailed department info', async () => {
    const res = await request(app)
      .get(`/api/departments/${testDeptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testDeptId);
    expect(res.body.data).toHaveProperty('designations');
    expect(res.body.data).toHaveProperty('employees');
  });

  it('PUT /api/departments/:id should update department details', async () => {
    const res = await request(app)
      .put(`/api/departments/${testDeptId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Quality Assurance & Automation',
        description: 'Automated testing and QA department',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Quality Assurance & Automation');
  });

  it('DELETE /api/departments/:id should delete empty department', async () => {
    const res = await request(app)
      .delete(`/api/departments/${testDeptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
  });

  it('DELETE /api/departments/:id should block deletion if department has employees', async () => {
    // Find department with employees (ENG or HR)
    const engDept = await prisma.department.findUnique({
      where: { code: 'ENG' },
      include: { _count: { select: { employees: true } } },
    });

    if (engDept && engDept._count.employees > 0) {
      const res = await request(app)
        .delete(`/api/departments/${engDept.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot delete department');
    }
  });
});
