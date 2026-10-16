import { prisma } from '../../database/prisma';
import { NotFoundError, BadRequestError, ConflictError } from '../../common/errors/app.error';
import {
  CreateJobOpeningInput,
  UpdateJobOpeningInput,
  CreateCandidateInput,
  TransitionStageInput,
  HireCandidateInput,
} from './recruitment.schema';
import { auditService } from '../audit/audit.service';
import { onboardingService } from '../onboarding/onboarding.service';

export class RecruitmentService {
  // --- Job Openings ---
  async listOpenings(status?: string, departmentId?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    return prisma.jobOpening.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
        hiringManager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOpeningById(id: string) {
    const opening = await prisma.jobOpening.findUnique({
      where: { id },
      include: {
        department: true,
        designation: true,
        hiringManager: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
        candidates: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            stage: true,
            source: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!opening) throw new NotFoundError('Job opening not found');
    return opening;
  }

  async createOpening(input: CreateJobOpeningInput, actorId?: string) {
    const opening = await prisma.jobOpening.create({
      data: {
        title: input.title,
        departmentId: input.departmentId || null,
        designationId: input.designationId || null,
        description: input.description,
        employmentType: input.employmentType,
        positionsCount: input.positionsCount,
        openingDate: input.openingDate ? new Date(input.openingDate) : new Date(),
        closingDate: input.closingDate ? new Date(input.closingDate) : null,
        hiringManagerId: input.hiringManagerId || null,
        status: input.status,
      },
      include: { department: true, designation: true },
    });

    await auditService.log({
      actorId,
      action: 'JOB_OPENING_CREATED',
      entity: 'JOB_OPENING',
      entityId: opening.id,
      summary: `Created job opening "${opening.title}" (${opening.status})`,
    });

    return opening;
  }

  async updateOpening(id: string, input: UpdateJobOpeningInput, actorId?: string) {
    const existing = await prisma.jobOpening.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Job opening not found');

    const updated = await prisma.jobOpening.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId || null } : {}),
        ...(input.designationId !== undefined ? { designationId: input.designationId || null } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.employmentType ? { employmentType: input.employmentType } : {}),
        ...(input.positionsCount !== undefined ? { positionsCount: input.positionsCount } : {}),
        ...(input.openingDate ? { openingDate: new Date(input.openingDate) } : {}),
        ...(input.closingDate !== undefined ? { closingDate: input.closingDate ? new Date(input.closingDate) : null } : {}),
        ...(input.hiringManagerId !== undefined ? { hiringManagerId: input.hiringManagerId || null } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: { department: true, designation: true },
    });

    await auditService.log({
      actorId,
      action: 'JOB_OPENING_UPDATED',
      entity: 'JOB_OPENING',
      entityId: updated.id,
      summary: `Updated job opening "${updated.title}"`,
    });

    return updated;
  }

  // --- Candidates ---
  async listCandidates(jobOpeningId?: string, stage?: string) {
    const where: Record<string, unknown> = {};
    if (jobOpeningId) where.jobOpeningId = jobOpeningId;
    if (stage) where.stage = stage;

    return prisma.candidate.findMany({
      where,
      include: {
        jobOpening: {
          select: {
            id: true,
            title: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
        hiredEmployee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCandidateById(id: string) {
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        jobOpening: {
          include: { department: true, designation: true },
        },
        stageHistory: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { id: true, email: true } } },
        },
        hiredEmployee: true,
      },
    });

    if (!candidate) throw new NotFoundError('Candidate not found');
    return candidate;
  }

  async apply(input: CreateCandidateInput) {
    const opening = await prisma.jobOpening.findUnique({ where: { id: input.jobOpeningId } });
    if (!opening) throw new NotFoundError('Job opening not found');

    if (opening.status !== 'OPEN') {
      throw new BadRequestError(`Cannot submit application — this position is currently ${opening.status.toLowerCase()}.`);
    }

    const candidate = await prisma.candidate.create({
      data: {
        jobOpeningId: input.jobOpeningId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone || null,
        resumeUrl: input.resumeUrl || null,
        source: input.source,
        stage: 'APPLIED',
        notes: input.notes || null,
      },
      include: { jobOpening: true },
    });

    await prisma.candidateStageHistory.create({
      data: {
        candidateId: candidate.id,
        fromStage: 'NONE',
        toStage: 'APPLIED',
        comment: 'Initial application received',
      },
    });

    return candidate;
  }

  async transitionStage(candidateId: string, input: TransitionStageInput, actorId?: string) {
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundError('Candidate not found');

    if (candidate.stage === input.toStage) {
      throw new BadRequestError(`Candidate is already in ${input.toStage} stage.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.candidate.update({
        where: { id: candidateId },
        data: { stage: input.toStage },
      });

      await tx.candidateStageHistory.create({
        data: {
          candidateId,
          fromStage: candidate.stage,
          toStage: input.toStage,
          comment: input.comment || null,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
          interviewerNotes: input.interviewerNotes || null,
          changedById: actorId || null,
        },
      });

      return u;
    });

    await auditService.log({
      actorId,
      action: 'CANDIDATE_STAGE_TRANSITION',
      entity: 'CANDIDATE',
      entityId: candidate.id,
      summary: `Moved ${candidate.fullName} from ${candidate.stage} to ${input.toStage}`,
    });

    return updated;
  }

  async hireCandidate(candidateId: string, input: HireCandidateInput, actorId?: string) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { jobOpening: true },
    });

    if (!candidate) throw new NotFoundError('Candidate not found');

    if (candidate.hiredEmployeeId) {
      throw new ConflictError('This candidate has already been hired and converted to an employee.');
    }

    // Split name into first and last
    const nameParts = candidate.fullName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Hired';

    // Check unique employee code & email
    const [codeExists, emailExists] = await Promise.all([
      prisma.employee.findUnique({ where: { employeeCode: input.employeeCode } }),
      prisma.employee.findUnique({ where: { workEmail: candidate.email } }),
    ]);

    if (codeExists) throw new ConflictError(`Employee code "${input.employeeCode}" already in use.`);
    if (emailExists) throw new ConflictError(`Work email "${candidate.email}" already exists for an employee.`);

    const deptId = input.departmentId || candidate.jobOpening.departmentId || null;
    const desigId = input.designationId || candidate.jobOpening.designationId || null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create employee
      const employee = await tx.employee.create({
        data: {
          employeeCode: input.employeeCode,
          firstName,
          lastName,
          workEmail: candidate.email,
          phone: candidate.phone || null,
          hireDate: new Date(input.hireDate),
          employmentStatus: input.employmentStatus,
          employmentType: input.employmentType,
          workLocation: input.workLocation,
          departmentId: deptId,
          designationId: desigId,
        },
      });

      // 2. Update candidate record
      const updatedCandidate = await tx.candidate.update({
        where: { id: candidateId },
        data: {
          stage: 'HIRED',
          hiredEmployeeId: employee.id,
        },
      });

      // 3. Stage transition log
      await tx.candidateStageHistory.create({
        data: {
          candidateId,
          fromStage: candidate.stage,
          toStage: 'HIRED',
          comment: `Hired as Employee ${input.employeeCode}`,
          changedById: actorId || null,
        },
      });

      return { candidate: updatedCandidate, employee };
    });

    // 4. Audit log after transaction commits
    await auditService.log({
      actorId,
      action: 'CANDIDATE_HIRED',
      entity: 'CANDIDATE',
      entityId: candidate.id,
      summary: `Hired ${candidate.fullName} as Employee ${input.employeeCode}`,
    });

    // 5. Trigger onboarding checklist automatically after transaction commits
    try {
      await onboardingService.generateTasksForEmployee(result.employee.id, deptId);
    } catch (e) {
      console.error('[Recruitment] Could not auto-generate onboarding tasks:', e);
    }

    return result;
  }
}

export const recruitmentService = new RecruitmentService();
