import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Recruitment API Tests', () => {
  let adminToken: string;
  let jobOpeningId: string;
  let closedJobId: string;
  let candidateId: string;

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
    await prisma.candidateStageHistory.deleteMany({
      where: { candidate: { email: 'applicant.dev@example.com' } },
    });
    const candidate = await prisma.candidate.findFirst({
      where: { email: 'applicant.dev@example.com' },
    });
    if (candidate?.hiredEmployeeId) {
      await prisma.onboardingTask.deleteMany({
        where: { employeeId: candidate.hiredEmployeeId },
      });
      await prisma.user.deleteMany({
        where: { employeeId: candidate.hiredEmployeeId },
      });
      await prisma.employee.deleteMany({
        where: { id: candidate.hiredEmployeeId },
      });
    }
    await prisma.candidate.deleteMany({
      where: { email: 'applicant.dev@example.com' },
    });
    if (jobOpeningId) {
      await prisma.jobOpening.deleteMany({ where: { id: jobOpeningId } });
    }
    if (closedJobId) {
      await prisma.jobOpening.deleteMany({ where: { id: closedJobId } });
    }
    await prisma.$disconnect();
  });

  it('POST /api/recruitment/openings should create a job opening', async () => {
    const res = await request(app)
      .post('/api/recruitment/openings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Full Stack TypeScript Engineer',
        description: 'Building enterprise HR and operational software systems',
        employmentType: 'FULL_TIME',
        positionsCount: 2,
        status: 'OPEN',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Full Stack TypeScript Engineer');
    jobOpeningId = res.body.data.id;
  });

  it('POST /api/recruitment/candidates should reject application if job is CLOSED', async () => {
    const closedRes = await request(app)
      .post('/api/recruitment/openings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Closed Position Test',
        description: 'Position that has already closed',
        status: 'CLOSED',
      });
    closedJobId = closedRes.body.data.id;

    const res = await request(app)
      .post('/api/recruitment/candidates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jobOpeningId: closedJobId,
        fullName: 'Jane Applicant',
        email: 'applicant.dev@example.com',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('currently closed');
  });

  it('POST /api/recruitment/candidates should register application for OPEN position', async () => {
    const res = await request(app)
      .post('/api/recruitment/candidates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        jobOpeningId,
        fullName: 'Jordan Miller',
        email: 'applicant.dev@example.com',
        phone: '+1 555-019-7777',
        source: 'LINKEDIN',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stage).toBe('APPLIED');
    candidateId = res.body.data.id;
  });

  it('POST /api/recruitment/candidates/:id/stage should advance the candidate to offer', async () => {
    const res = await request(app)
      .post(`/api/recruitment/candidates/${candidateId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        toStage: 'OFFER',
        comment: 'Offer approved after final interview',
        scheduledDate: '2026-04-10T14:00:00.000Z',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stage).toBe('OFFER');

    // Verify stage history record
    const history = await prisma.candidateStageHistory.findFirst({
      where: { candidateId, toStage: 'OFFER' },
    });
    expect(history).toBeDefined();
    expect(history?.comment).toBe('Offer approved after final interview');
  });

  it('POST /api/recruitment/candidates/:id/hire should convert candidate to employee and link record', async () => {
    const res = await request(app)
      .post(`/api/recruitment/candidates/${candidateId}/hire`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: 'EMP-HIRE-01',
        firstName: 'Jordan',
        middleName: 'Taylor',
        lastName: 'Miller',
        workEmail: 'jordan.miller@worksphere.io',
        personalEmail: 'applicant.dev@example.com',
        phone: '+1 555-019-7777',
        hireDate: '2026-05-01',
        workLocation: 'Innovation Lab',
        employmentStatus: 'PROBATION',
        employmentType: 'FULL_TIME',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.candidate.stage).toBe('HIRED');
    expect(res.body.data.employee.employeeCode).toBe('EMP-HIRE-01');
    expect(res.body.data.employee.firstName).toBe('Jordan');
    expect(res.body.data.employee.middleName).toBe('Taylor');
    expect(res.body.data.employee.lastName).toBe('Miller');
    expect(res.body.data.employee.workEmail).toBe('jordan.miller@worksphere.io');
    expect(res.body.data.employee.personalEmail).toBe('applicant.dev@example.com');
    expect(res.body.data.credentials.email).toBe('jordan.miller@worksphere.io');
    expect(res.body.data.credentials.temporaryPassword).toBeTruthy();

    const employeeListRes = await request(app)
      .get('/api/employees?search=EMP-HIRE-01')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(employeeListRes.status).toBe(200);
    expect(employeeListRes.body.data.some((employee: { id: string }) => employee.id === res.body.data.employee.id)).toBe(true);

    const linkedUser = await prisma.user.findUnique({
      where: { email: 'jordan.miller@worksphere.io' },
      select: { employeeId: true, isActive: true, role: { select: { name: true } } },
    });
    expect(linkedUser).toEqual({ employeeId: res.body.data.employee.id, isActive: true, role: { name: 'Employee' } });

    // Attempting to re-hire the same candidate should fail
    const rehireRes = await request(app)
      .post(`/api/recruitment/candidates/${candidateId}/hire`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: 'EMP-HIRE-02',
        hireDate: '2026-05-01',
      });

    expect(rehireRes.status).toBe(409);
    expect(rehireRes.body.success).toBe(false);
  });
});
