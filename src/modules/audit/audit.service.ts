import { prisma } from '../../database/prisma';

export interface AuditParams {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  summary?: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export class AuditService {
  async log(params: AuditParams) {
    try {
      return await prisma.auditLog.create({
        data: {
          actorId: params.actorId || null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          summary: params.summary || null,
          details: params.details ? JSON.stringify(params.details) : null,
          ipAddress: params.ipAddress || null,
        },
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit log:', err);
      return null;
    }
  }

  async list(entity?: string, entityId?: string, limit = 50) {
    return prisma.auditLog.findMany({
      where: {
        ...(entity ? { entity } : {}),
        ...(entityId ? { entityId } : {}),
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true, employeeCode: true } },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}

export const auditService = new AuditService();
