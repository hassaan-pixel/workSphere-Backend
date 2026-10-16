import { prisma } from '../../database/prisma';
import { auditService } from '../audit/audit.service';
import { BadRequestError, NotFoundError } from '../../common/errors/app.error';

const DEFAULT_SETTINGS: Record<string, { value: string; description: string; category: string }> = {
  'org.name': { value: 'WorkSphere Technologies Inc.', description: 'Organization legal trading name', category: 'general' },
  'org.code': { value: 'WS-CORP', description: 'Organization identifier code', category: 'general' },
  'org.email': { value: 'operations@worksphere.io', description: 'Primary administrative contact email', category: 'general' },
  'org.phone': { value: '+1 (555) 019-2834', description: 'Corporate contact phone', category: 'general' },
  'org.address': { value: '100 Innovation Way, Suite 400, Tech City, CA 94105', description: 'Corporate headquarters physical address', category: 'general' },
  'org.timezone': { value: 'America/Los_Angeles', description: 'Primary company operating time zone', category: 'general' },
  'org.currency': { value: 'USD', description: 'Standard financial operating currency', category: 'general' },
  'org.dateFormat': { value: 'YYYY-MM-DD', description: 'Display date format preference', category: 'general' },
  'work.workingDays': { value: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY', description: 'Standard operating work days of week', category: 'attendance' },
  'work.standardHoursPerDay': { value: '8.0', description: 'Target expected daily work duration in decimal hours', category: 'attendance' },
  'work.gracePeriodMinutes': { value: '15', description: 'Late threshold grace period before flag in minutes', category: 'attendance' },
  'work.overtimeThresholdHours': { value: '8.5', description: 'Daily hours exceeding this mark are classified as overtime', category: 'attendance' },
  'payroll.standardComponents': {
    value: JSON.stringify([
      { name: 'Basic Salary', type: 'EARNING', description: 'Core base monthly compensation' },
      { name: 'Housing Allowance', type: 'EARNING', description: 'Standard accommodation support' },
      { name: 'Transport Allowance', type: 'EARNING', description: 'Commuting and transit stipend' },
      { name: 'Medical & Health Allowance', type: 'EARNING', description: 'Healthcare contribution benefit' },
      { name: 'Statutory Income Tax', type: 'DEDUCTION', description: 'Pay-as-you-earn statutory withholding' },
      { name: 'Social Security / Pension', type: 'DEDUCTION', description: 'Mandatory retirement contribution' },
      { name: 'Health Insurance Premium', type: 'DEDUCTION', description: 'Employee medical plan premium share' },
    ]),
    description: 'Pre-configured standard salary component library',
    category: 'payroll',
  },
};

export class SettingsService {
  async getAllSettings() {
    const records = await prisma.appSetting.findMany();
    const settingsMap: Record<string, string> = {};

    // Seed defaults for any missing key
    for (const [key, meta] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = records.find((r) => r.key === key);
      if (existing) {
        settingsMap[key] = existing.value;
      } else {
        settingsMap[key] = meta.value;
        await prisma.appSetting.create({
          data: { key, value: meta.value, description: meta.description, category: meta.category },
        }).catch(() => {});
      }
    }

    // Add any custom settings present in DB
    for (const r of records) {
      settingsMap[r.key] = r.value;
    }

    return settingsMap;
  }

  async updateSettings(updates: Record<string, string>, actorId: string) {
    const results: Record<string, string> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== 'string') continue;
      const meta = DEFAULT_SETTINGS[key] || { description: 'Custom system setting', category: 'general' };
      const updated = await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value, description: meta.description, category: meta.category },
      });
      results[updated.key] = updated.value;
    }

    await auditService.log({
      actorId,
      action: 'UPDATE',
      entity: 'APP_SETTING',
      entityId: 'global',
      summary: `Updated system settings: ${Object.keys(updates).join(', ')}`,
      details: updates,
    });

    return results;
  }

  // --- Leave Policies ---
  async listLeaveTypes() {
    return prisma.leaveType.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async createLeaveType(data: {
    code: string;
    name: string;
    description?: string;
    defaultDaysPerYear: number;
    isPaid: boolean;
    requiresApproval: boolean;
    color?: string;
  }, actorId: string) {
    const existing = await prisma.leaveType.findUnique({ where: { code: data.code.toUpperCase() } });
    if (existing) throw new BadRequestError(`Leave type code '${data.code}' already exists.`);

    const created = await prisma.leaveType.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        defaultDaysPerYear: Number(data.defaultDaysPerYear) || 14,
        isPaid: data.isPaid ?? true,
        requiresApproval: data.requiresApproval ?? true,
        color: data.color || '#0d9488',
      },
    });

    await auditService.log({
      actorId,
      action: 'CREATE',
      entity: 'LEAVE_TYPE',
      entityId: created.id,
      summary: `Created leave type policy: ${created.name} (${created.code})`,
    });

    return created;
  }

  async updateLeaveType(id: string, data: {
    name?: string;
    description?: string;
    defaultDaysPerYear?: number;
    isPaid?: boolean;
    requiresApproval?: boolean;
    isActive?: boolean;
    color?: string;
  }, actorId: string) {
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Leave type not found.');

    const updated = await prisma.leaveType.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        defaultDaysPerYear: data.defaultDaysPerYear !== undefined ? Number(data.defaultDaysPerYear) : existing.defaultDaysPerYear,
        isPaid: data.isPaid !== undefined ? data.isPaid : existing.isPaid,
        requiresApproval: data.requiresApproval !== undefined ? data.requiresApproval : existing.requiresApproval,
        isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
        color: data.color ?? existing.color,
      },
    });

    await auditService.log({
      actorId,
      action: 'UPDATE',
      entity: 'LEAVE_TYPE',
      entityId: id,
      summary: `Updated leave type policy: ${updated.name}`,
    });

    return updated;
  }
}

export const settingsService = new SettingsService();
