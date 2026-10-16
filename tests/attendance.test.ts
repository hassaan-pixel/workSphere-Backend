import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Attendance API Tests', () => {
  let adminToken: string;
  let employeeId: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = loginRes.body.data.token;

    const emp = await prisma.employee.findFirst({ where: { employeeCode: 'EMP-001' } });
    employeeId = emp?.id || '';
  });

  afterAll(async () => {
    await prisma.attendanceSession.deleteMany({
      where: { attendanceRecord: { employeeId } },
    });
    await prisma.attendanceRecord.deleteMany({
      where: { employeeId },
    });
    await prisma.$disconnect();
  });

  it('POST /api/attendance/manual should record manual attendance with audit log', async () => {
    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        workDate: '2026-03-10',
        status: 'PRESENT',
        checkInTime: '2026-03-10T09:00:00.000Z',
        checkOutTime: '2026-03-10T17:30:00.000Z',
        workingHours: 8.5,
        overtimeHours: 0.5,
        correctionReason: 'Badge reader scanner was offline',
        notes: 'Verified by department manager',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PRESENT');
    expect(res.body.data.workingHours).toBe(8.5);
    expect(res.body.data.overtimeHours).toBe(0.5);
    expect(res.body.data.isManualEntry).toBe(true);

    // Verify audit log was created
    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'ATTENDANCE', entityId: res.body.data.id },
    });
    expect(audit).toBeDefined();
    expect(audit?.action).toBe('MANUAL_ATTENDANCE_ENTRY');
  });

  it('POST /api/attendance/manual should enforce uniqueness by updating existing record', async () => {
    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        workDate: '2026-03-10',
        status: 'HALF_DAY',
        workingHours: 4.0,
        correctionReason: 'Employee had approved doctor visit in afternoon',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('HALF_DAY');
    expect(res.body.data.workingHours).toBe(4.0);

    // Ensure only 1 record exists for that employee on that workday
    const count = await prisma.attendanceRecord.count({
      where: {
        employeeId,
        workDate: new Date('2026-03-10T00:00:00.000Z'),
      },
    });
    expect(count).toBe(1);
  });

  it('POST /api/attendance/clock-in and clock-out flow', async () => {
    // Clock in
    const clockInRes = await request(app)
      .post('/api/attendance/clock-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        notes: 'Clocking in from workstation',
      });

    expect(clockInRes.status).toBe(201);
    expect(clockInRes.body.success).toBe(true);
    expect(clockInRes.body.data).toHaveProperty('record');
    expect(clockInRes.body.data).toHaveProperty('session');

    // Double clock-in should be rejected
    const doubleClockIn = await request(app)
      .post('/api/attendance/clock-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId });

    expect(doubleClockIn.status).toBe(400);
    expect(doubleClockIn.body.error.message).toContain('already clocked in');

    // Clock out
    const clockOutRes = await request(app)
      .post('/api/attendance/clock-out')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        notes: 'End of daily shift',
      });

    expect(clockOutRes.status).toBe(200);
    expect(clockOutRes.body.success).toBe(true);
    expect(clockOutRes.body.data.checkOutTime).toBeDefined();
  });

  it('GET /api/attendance/summary should aggregate attendance metrics', async () => {
    const res = await request(app)
      .get('/api/attendance/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalRecords');
    expect(res.body.data).toHaveProperty('present');
    expect(res.body.data).toHaveProperty('totalHours');
  });

  it('GET /api/attendance/export should export valid CSV data', async () => {
    const res = await request(app)
      .get('/api/attendance/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Date,Employee Code,Name,Department');
  });
});
