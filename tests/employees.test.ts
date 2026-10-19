import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Employees API Tests', () => {
  let adminToken: string;
  let testEmpId: string;
  let assignedEmployeeId: string;
  let assignedTemporaryPassword: string;
  let deptId: string;
  let desigId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;

    const dept = await prisma.department.findFirst();
    deptId = dept?.id || '';

    const desig = await prisma.designation.findFirst();
    desigId = desig?.id || '';
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['test.candidate@worksphere.io', 'duplicate.email@worksphere.io', 'role.assignment@worksphere.io'] } },
    });
    await prisma.employee.deleteMany({
      where: { employeeCode: { in: ['EMP-TEST-99', 'EMP-TEST-100', 'EMP-TEST-101'] } },
    });
    await prisma.$disconnect();
  });

  it('GET /api/employees should return paginated list of employees with meta', async () => {
    const res = await request(app)
      .get('/api/employees?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('page', 1);
    expect(res.body.meta).toHaveProperty('limit', 5);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('totalPages');
  });

  it('GET /api/employees with search query should filter by name or email', async () => {
    const res = await request(app)
      .get('/api/employees?search=admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/employees should create a new employee record', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: 'EMP-TEST-99',
        firstName: 'Test',
        lastName: 'Candidate',
        workEmail: 'test.candidate@worksphere.io',
        hireDate: '2026-03-01',
        employmentStatus: 'PROBATION',
        employmentType: 'FULL_TIME',
        workLocation: 'Remote',
        departmentId: deptId,
        designationId: desigId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employeeCode).toBe('EMP-TEST-99');
    expect(res.body.data.firstName).toBe('Test');
    expect(res.body.data.lastName).toBe('Candidate');
    testEmpId = res.body.data.id;
  });

  it('POST /api/employees should apply the selected role and additional permissions to the account', async () => {
    const role = await prisma.role.findUnique({ where: { name: 'HR Officer' } });
    expect(role).toBeTruthy();

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: 'EMP-TEST-101',
        firstName: 'Role',
        lastName: 'Assignment',
        workEmail: 'role.assignment@worksphere.io',
        hireDate: '2026-03-01',
        employmentStatus: 'ACTIVE',
        employmentType: 'FULL_TIME',
        workLocation: 'Remote',
        roleId: role!.id,
        permissionCodes: ['reports:read', 'reports:export'],
      });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({
      where: { email: 'role.assignment@worksphere.io' },
      include: { role: true, userPermissions: { include: { permission: true } } },
    });
    expect(user?.role.name).toBe('HR Officer');
    expect(user?.userPermissions.map((item) => item.permission.code)).toContain('reports:export');
    assignedEmployeeId = res.body.data.employee.id;
    assignedTemporaryPassword = res.body.data.credentials.temporaryPassword;

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'role.assignment@worksphere.io', password: res.body.data.credentials.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role.name).toBe('HR Officer');
    expect(login.body.data.user.permissions).toContain('reports:export');
  });

  it('PUT /api/employees/:id should update the account role and additional permissions', async () => {
    const role = await prisma.role.findUnique({ where: { name: 'HR Officer' } });
    const res = await request(app)
      .put(`/api/employees/${assignedEmployeeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roleId: role!.id,
        permissionCodes: ['reports:read', 'reports:export', 'payroll:read'],
      });

    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({
      where: { email: 'role.assignment@worksphere.io' },
      include: { userPermissions: { include: { permission: true } } },
    });
    expect(user?.userPermissions.map((item) => item.permission.code).sort()).toEqual(['payroll:read', 'reports:export']);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'role.assignment@worksphere.io', password: assignedTemporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.user.permissions).toContain('payroll:read');
  });

  it('POST /api/employees should reject duplicate workEmail with 409 conflict', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: 'EMP-TEST-100',
        firstName: 'Duplicate',
        lastName: 'Email',
        workEmail: 'test.candidate@worksphere.io',
        hireDate: '2026-03-01',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Work email');
  });

  it('GET /api/employees/:id should return employee details with relations', async () => {
    const res = await request(app)
      .get(`/api/employees/${testEmpId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testEmpId);
    expect(res.body.data.employeeCode).toBe('EMP-TEST-99');
    expect(res.body.data).toHaveProperty('department');
    expect(res.body.data).toHaveProperty('designation');
    expect(res.body.data).toHaveProperty('directReports');
  });

  it('PUT /api/employees/:id should update employee details', async () => {
    const res = await request(app)
      .put(`/api/employees/${testEmpId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employmentStatus: 'ACTIVE',
        workLocation: 'New York Office',
        phone: '+1 555-010-9999',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employmentStatus).toBe('ACTIVE');
    expect(res.body.data.workLocation).toBe('New York Office');
    expect(res.body.data.phone).toBe('+1 555-010-9999');
  });

  it('PUT /api/employees/:id should prevent self-reporting hierarchy conflict', async () => {
    const res = await request(app)
      .put(`/api/employees/${testEmpId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reportingManagerId: testEmpId,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('cannot be their own reporting manager');
  });

  it('DELETE /api/employees/:id should delete employee record', async () => {
    const res = await request(app)
      .delete(`/api/employees/${testEmpId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
  });
});
