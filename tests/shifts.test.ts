import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Shifts Management API Tests', () => {
  let adminToken: string;
  let testShiftId: string;
  let employeeId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;

    const emp = await prisma.employee.findFirst();
    employeeId = emp?.id || '';
  });

  afterAll(async () => {
    await prisma.shiftAssignment.deleteMany({
      where: { shift: { code: { in: ['TST_NIGHT', 'TST_MORN'] } } },
    });
    await prisma.shift.deleteMany({
      where: { code: { in: ['TST_NIGHT', 'TST_MORN'] } },
    });
    await prisma.$disconnect();
  });

  it('POST /api/shifts should handle overnight shifts without negative hours', async () => {
    const res = await request(app)
      .post('/api/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TST_NIGHT',
        name: 'Test Overnight Shift',
        startTime: '22:00',
        endTime: '06:00',
        breakDurationMinutes: 60,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isOvernight).toBe(true);
    // (22:00 to 06:00) is 8 hours total, minus 1 hour break = 7.0 expected hours
    expect(res.body.data.expectedHours).toBe(7.0);
    testShiftId = res.body.data.id;
  });

  it('POST /api/shifts should reject duplicate shift code', async () => {
    const res = await request(app)
      .post('/api/shifts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TST_NIGHT',
        name: 'Duplicate Shift',
        startTime: '08:00',
        endTime: '16:00',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/shifts/assign should assign shift to employee and prevent date conflict', async () => {
    // 1. Assign shift with defined date range
    const assignRes1 = await request(app)
      .post('/api/shifts/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        shiftId: testShiftId,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });

    expect(assignRes1.status).toBe(201);
    expect(assignRes1.body.success).toBe(true);

    // 2. Attempt overlapping shift assignment for the same employee
    const conflictRes = await request(app)
      .post('/api/shifts/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        shiftId: testShiftId,
        startDate: '2026-06-15',
        endDate: '2026-07-15',
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.success).toBe(false);
    expect(conflictRes.body.error.message).toContain('already has an active shift assignment');
  });

  it('DELETE /api/shifts/:id should prevent deleting shift with active assignments', async () => {
    const res = await request(app)
      .delete(`/api/shifts/${testShiftId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('active employee assignments');
  });
});
