import { prisma } from '../../database/prisma';
import { NotFoundError, BadRequestError } from '../../common/errors/app.error';
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  CreateTaskInput,
  UpdateTaskStatusInput,
} from './onboarding.schema';
import { auditService } from '../audit/audit.service';
import { dateOnlyUtc } from '../../common/utils/timezone.utils';

export class OnboardingService {
  // --- Templates ---
  async listTemplates() {
    return prisma.onboardingTemplate.findMany({
      include: {
        department: { select: { id: true, name: true, code: true } },
        items: { orderBy: { order: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplateById(id: string) {
    const template = await prisma.onboardingTemplate.findUnique({
      where: { id },
      include: {
        department: true,
        items: { orderBy: { order: 'asc' } },
      },
    });
    if (!template) throw new NotFoundError('Onboarding template not found');
    return template;
  }

  async createTemplate(input: CreateTemplateInput) {
    return prisma.onboardingTemplate.create({
      data: {
        name: input.name,
        description: input.description || null,
        departmentId: input.departmentId || null,
        isActive: input.isActive ?? true,
        items: input.items
          ? {
              create: input.items.map((item, idx) => ({
                title: item.title,
                description: item.description || null,
                defaultDueDays: item.defaultDueDays ?? 7,
                category: item.category || 'GENERAL',
                order: item.order ?? idx,
              })),
            }
          : undefined,
      },
      include: { items: true },
    });
  }

  async updateTemplate(id: string, input: UpdateTemplateInput) {
    const existing = await prisma.onboardingTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Onboarding template not found');

    return prisma.onboardingTemplate.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { items: true },
    });
  }

  // --- Tasks & Generation ---
  async generateTasksForEmployee(employeeId: string, departmentId?: string | null, templateId?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundError('Employee not found');

    let template;
    if (templateId) {
      template = await prisma.onboardingTemplate.findUnique({
        where: { id: templateId },
        include: { items: { orderBy: { order: 'asc' } } },
      });
    } else {
      // Find matching department template or standard fallback
      template = await prisma.onboardingTemplate.findFirst({
        where: {
          isActive: true,
          OR: [
            ...(departmentId ? [{ departmentId }] : []),
            { name: 'Standard Employee Onboarding' },
          ],
        },
        include: { items: { orderBy: { order: 'asc' } } },
      });
    }

    if (!template || template.items.length === 0) {
      return [];
    }

    const baseDate = new Date(employee.hireDate || new Date());

    const tasksToCreate = template.items.map((item) => {
      const dueDate = new Date(baseDate);
      dueDate.setUTCDate(dueDate.getUTCDate() + item.defaultDueDays);

      return {
        employeeId,
        title: item.title,
        description: item.description || null,
        category: item.category,
        dueDate,
        status: 'PENDING',
      };
    });

    const created = await Promise.all(
      tasksToCreate.map((task) => prisma.onboardingTask.create({ data: task }))
    );

    return created;
  }

  async listTasksForEmployee(employeeId: string) {
    const tasks = await prisma.onboardingTask.findMany({
      where: { employeeId },
      include: {
        assignedOwner: {
          select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const overdue = tasks.filter((t) => t.status !== 'COMPLETED' && new Date(t.dueDate) < now).length;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      tasks: tasks.map((t) => ({
        ...t,
        isOverdue: t.status !== 'COMPLETED' && new Date(t.dueDate) < now,
      })),
      stats: { total, completed, overdue, progressPercent },
    };
  }

  async createTask(input: CreateTaskInput, actorId?: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundError('Employee not found');

    const task = await prisma.onboardingTask.create({
      data: {
        employeeId: input.employeeId,
        title: input.title,
        description: input.description || null,
        category: input.category || 'GENERAL',
        assignedOwnerId: input.assignedOwnerId || null,
        dueDate: dateOnlyUtc(input.dueDate),
        status: input.status || 'PENDING',
        notes: input.notes || null,
      },
    });

    await auditService.log({
      actorId,
      action: 'ONBOARDING_TASK_CREATED',
      entity: 'ONBOARDING_TASK',
      entityId: task.id,
      summary: `Created task "${task.title}" for ${employee.firstName} ${employee.lastName}`,
    });

    return task;
  }

  async updateTaskStatus(id: string, input: UpdateTaskStatusInput, actorId?: string) {
    const task = await prisma.onboardingTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundError('Onboarding task not found');

    const completionDate = input.status === 'COMPLETED' ? new Date() : null;

    const updated = await prisma.onboardingTask.update({
      where: { id },
      data: {
        status: input.status,
        completionDate,
        notes: input.notes !== undefined ? input.notes : task.notes,
      },
    });

    await auditService.log({
      actorId,
      action: 'ONBOARDING_TASK_UPDATED',
      entity: 'ONBOARDING_TASK',
      entityId: task.id,
      summary: `Updated task "${task.title}" to ${input.status}`,
    });

    return updated;
  }

  async listAllTasks(status?: string, employeeId?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const tasks = await prisma.onboardingTask.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { name: true } },
          },
        },
        assignedOwner: {
          select: { id: true, email: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    return tasks.map((t) => ({
      ...t,
      isOverdue: t.status !== 'COMPLETED' && new Date(t.dueDate) < now,
    }));
  }
}

export const onboardingService = new OnboardingService();
