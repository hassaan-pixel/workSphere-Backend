import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Permissions & Authorization Tests', () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;
  let otherEmployeeId: string;

  beforeAll(async () => {
    // 1. Login as Super Admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = adminLogin.body.data.token;

    // 2. Login as Standard Employee
    const empLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'employee.elena@worksphere.io',
        password: 'Employee@123!',
      });
    employeeToken = empLogin.body.data.token;
    employeeId = empLogin.body.data.user.employee.id;

    // Fetch another employee ID
    const otherEmp = await prisma.employee.findFirst({
      where: { employeeCode: 'EMP-003' }, // Sarah Jenkins
    });
    otherEmployeeId = otherEmp!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Permission Enforcement', () => {
    it('Super Admin should successfully access GET /api/dashboard/metrics', async () => {
      const res = await request(app)
        .get('/api/dashboard/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data.summary).toHaveProperty('totalEmployees');
      expect(res.body.data.summary).toHaveProperty('activeEmployees');
      expect(res.body.data.summary.presentToday).toHaveProperty('isImplemented', false);
      expect(res.body.data).toHaveProperty('departmentDistribution');
      expect(res.body.data).toHaveProperty('recentAdditions');
    });

    it('Super Admin should access user management GET /api/users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('Standard Employee should be FORBIDDEN (403) from accessing GET /api/users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('IDOR & Employee Scope Protection', () => {
    it('Employee should be able to access their own employee record', async () => {
      const res = await request(app)
        .get(`/api/employees/${employeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(employeeId);
    });

    it('Employee should be FORBIDDEN (403) from accessing another employee record by URL tampering', async () => {
      const res = await request(app)
        .get(`/api/employees/${otherEmployeeId}`)
        .set('Authorization', `Bearer ${employeeToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Super Admin can access any employee record', async () => {
      const res = await request(app)
        .get(`/api/employees/${otherEmployeeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(otherEmployeeId);
    });
  });
});
