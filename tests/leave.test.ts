import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Leave Management API Tests', () => {
  let adminToken: string;
  let employeeToken: string;
  let employeeUser: any;
  let annualLeaveTypeId: string;
  let createdRequestId: string;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@worksphere.io',
        password: 'Admin@WorkSphere2026!',
      });
    adminToken = adminRes.body.data.token;

    // 2. Regular employee login (Elena Rostova - EMP-004)
    const empRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'employee.elena@worksphere.io',
        password: 'Employee@123!',
      });
    employeeToken = empRes.body.data.token;
    employeeUser = empRes.body.data.user;

    const lt = await prisma.leaveType.findUnique({ where: { code: 'ANNUAL' } });
    annualLeaveTypeId = lt?.id || '';
  });

  afterAll(async () => {
    if (createdRequestId) {
      await prisma.leaveRequest.deleteMany({
        where: { id: createdRequestId },
      });
    }
    await prisma.$disconnect();
  });

  it('POST /api/leave/requests should calculate duration excluding weekends and holidays', async () => {
    // 2026-05-22 is Friday.
    // 2026-05-23 is Saturday (weekend).
    // 2026-05-24 is Sunday (weekend).
    // 2026-05-25 is Monday (Memorial Day - seeded holiday).
    // Total working days should be exactly 1!
    const res = await request(app)
      .post('/api/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: annualLeaveTypeId,
        startDate: '2026-05-22',
        endDate: '2026-05-25',
        reason: 'Family spring weekend trip',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.durationDays).toBe(1);
    expect(res.body.data.status).toBe('PENDING');
    createdRequestId = res.body.data.id;
  });

  it('POST /api/leave/requests should prevent overlapping leave applications', async () => {
    const res = await request(app)
      .post('/api/leave/requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveTypeId: annualLeaveTypeId,
        startDate: '2026-05-22',
        endDate: '2026-05-22',
        reason: 'Duplicate attempt for same date',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Overlapping');
  });

  it('POST /api/leave/requests/:id/review should reject employee without leave:approve permission', async () => {
    // Employee role does NOT have 'leave:approve' permission,
    // so this should be rejected at the authorization layer before self-approval check.
    const res = await request(app)
      .post(`/api/leave/requests/${createdRequestId}/review`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        action: 'APPROVE',
        comment: 'Self approving',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Insufficient permissions');
  });

  it('POST /api/leave/requests/:id/review should allow admin to approve and update balance ledger', async () => {
    const res = await request(app)
      .post(`/api/leave/requests/${createdRequestId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'APPROVE',
        comment: 'Approved by management',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');

    // Verify leave balance was deducted from pending to used
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employeeUser.employee?.id,
          leaveTypeId: annualLeaveTypeId,
          year: 2026,
        },
      },
    });

    expect(balance?.used).toBeGreaterThanOrEqual(1);

    // Verify AttendanceRecord was created for 2026-05-22 with status 'APPROVED_LEAVE'
    const attendance = await prisma.attendanceRecord.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: employeeUser.employee?.id,
          workDate: new Date('2026-05-22T00:00:00.000Z'),
        },
      },
    });
    expect(attendance).toBeDefined();
    expect(attendance?.status).toBe('APPROVED_LEAVE');
  });

  it('POST /api/leave/requests/:id/cancel should revert used balance upon cancellation', async () => {
    const res = await request(app)
      .post(`/api/leave/requests/${createdRequestId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Trip was rescheduled',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CANCELLED');

    // Verify balance was reverted
    const balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employeeUser.employee?.id,
          leaveTypeId: annualLeaveTypeId,
          year: 2026,
        },
      },
    });
    expect(balance?.used).toBe(0);
  });
});
