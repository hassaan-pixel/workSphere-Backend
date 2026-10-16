import { prisma } from '../../database/prisma';
import { BadRequestError, NotFoundError } from '../../common/errors/app.error';
import { PayrollRunInput, SalaryStructureInput } from './payroll.schema';
import { auditService } from '../audit/audit.service';

export class PayrollService {
  async listSalaryStructures(employeeId?: string) {
    return prisma.salaryStructure.findMany({
      where: employeeId ? { employeeId } : undefined,
      include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } }, components: true },
      orderBy: [{ employeeId: 'asc' }, { effectiveDate: 'desc' }],
    });
  }

  async createSalaryStructure(input: SalaryStructureInput, actorId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundError('Employee not found.');
    const effectiveDate = new Date(input.effectiveDate);
    return prisma.$transaction(async (tx) => {
      await tx.salaryStructure.updateMany({
        where: { employeeId: input.employeeId, effectiveDate: { lte: effectiveDate }, isActive: true },
        data: { isActive: false },
      });
      return tx.salaryStructure.create({
        data: {
          employeeId: input.employeeId, effectiveDate, basicSalaryCents: input.basicSalaryCents,
          currency: input.currency, paymentFrequency: input.paymentFrequency, createdById: actorId,
          components: { create: input.components },
        },
        include: { components: true },
      });
    });
  }

  async listRuns() {
    return prisma.payrollRun.findMany({
      include: { _count: { select: { entries: true } }, createdBy: { select: { email: true } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  async createRun(input: PayrollRunInput, actorId: string) {
    return prisma.payrollRun.create({
      data: { periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd), currency: input.currency, createdById: actorId },
    });
  }

  async processRun(id: string, actorId: string) {
    const run = await prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundError('Payroll run not found.');
    if (run.status !== 'DRAFT') throw new BadRequestError('Only draft payroll runs can be processed.');

    const [employees, structures] = await Promise.all([
      prisma.employee.findMany({ where: { employmentStatus: 'ACTIVE' }, select: { id: true } }),
      prisma.salaryStructure.findMany({
        where: { isActive: true, currency: run.currency, effectiveDate: { lte: run.periodEnd } },
        include: { components: true }, orderBy: { effectiveDate: 'desc' },
      }),
    ]);
    const structureByEmployee = new Map<string, typeof structures[number]>();
    for (const structure of structures) if (!structureByEmployee.has(structure.employeeId)) structureByEmployee.set(structure.employeeId, structure);
    const calculated = employees.flatMap((employee) => {
      const structure = structureByEmployee.get(employee.id);
      if (!structure) return [];
      const earnings = structure.components.filter((item) => item.type === 'EARNING').reduce((sum, item) => sum + item.amountCents, 0);
      const deductions = structure.components.filter((item) => item.type === 'DEDUCTION').reduce((sum, item) => sum + item.amountCents, 0);
      const gross = structure.basicSalaryCents + earnings;
      return [{ employeeId: employee.id, basicSalaryCents: structure.basicSalaryCents, grossCents: gross, deductionCents: deductions, netCents: Math.max(0, gross - deductions), items: structure.components }];
    });
    if (!calculated.length) throw new BadRequestError('No active salary structures were eligible for this payroll period and currency.');

    const result = await prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({ where: { id }, data: { status: 'PROCESSING' } });
      await tx.payrollEntry.deleteMany({ where: { payrollRunId: id } });
      await tx.payrollEntry.createMany({ data: calculated.map(({ items, ...entry }) => ({ payrollRunId: id, ...entry })) });
      const entries = await tx.payrollEntry.findMany({ where: { payrollRunId: id }, select: { id: true, employeeId: true } });
      const entryIdByEmployee = new Map(entries.map((entry) => [entry.employeeId, entry.id]));
      await tx.payrollEntryItem.createMany({ data: calculated.flatMap((entry) => entry.items.map((item) => ({ payrollEntryId: entryIdByEmployee.get(entry.employeeId)!, name: item.name, type: item.type, amountCents: item.amountCents }))) });
      const totals = calculated.reduce((sum, entry) => ({ gross: sum.gross + entry.grossCents, deductions: sum.deductions + entry.deductionCents, net: sum.net + entry.netCents }), { gross: 0, deductions: 0, net: 0 });
      return tx.payrollRun.update({ where: { id }, data: { status: 'REVIEW', grossTotalCents: totals.gross, deductionCents: totals.deductions, netTotalCents: totals.net }, include: { _count: { select: { entries: true } } } });
    });
    await auditService.log({ actorId, action: 'PROCESS', entity: 'PAYROLL_RUN', entityId: id, summary: `Processed payroll for ${result._count.entries} employees` });
    return result;
  }

  async transitionRun(id: string, action: 'approve' | 'finalize', actorId: string) {
    const run = await prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundError('Payroll run not found.');
    const expected = action === 'approve' ? 'REVIEW' : 'APPROVED';
    if (run.status !== expected) throw new BadRequestError(`Payroll run must be in ${expected} status to ${action}.`);
    const data = action === 'approve' ? { status: 'APPROVED', approvedById: actorId } : { status: 'FINALIZED', finalizedAt: new Date() };
    const updated = await prisma.payrollRun.update({ where: { id }, data });
    await auditService.log({ actorId, action: action.toUpperCase(), entity: 'PAYROLL_RUN', entityId: id, summary: `Payroll run ${action}d` });
    return updated;
  }

  async getRunDetails(id: string) {
    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        createdBy: { select: { email: true } },
        approvedBy: { select: { email: true } },
        entries: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                workEmail: true,
                department: { select: { name: true } },
                designation: { select: { name: true } },
              },
            },
            items: true,
          },
          orderBy: { employee: { employeeCode: 'asc' } },
        },
      },
    });
    if (!run) throw new NotFoundError('Payroll run not found.');
    return run;
  }

  async getRunCsv(id: string): Promise<string> {
    const run = await this.getRunDetails(id);
    const headers = [
      'Employee Code',
      'First Name',
      'Last Name',
      'Department',
      'Designation',
      'Currency',
      'Basic Salary',
      'Gross Pay',
      'Total Deductions',
      'Net Pay',
      'Payment Status',
    ];

    const rows = run.entries.map((e) => [
      `"${e.employee.employeeCode}"`,
      `"${e.employee.firstName}"`,
      `"${e.employee.lastName}"`,
      `"${e.employee.department?.name || ''}"`,
      `"${e.employee.designation?.name || ''}"`,
      `"${run.currency}"`,
      (e.basicSalaryCents / 100).toFixed(2),
      (e.grossCents / 100).toFixed(2),
      (e.deductionCents / 100).toFixed(2),
      (e.netCents / 100).toFixed(2),
      `"${e.paymentStatus}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async getPayslip(entryId: string, requester: { employeeId?: string | null; roleName: string }) {
    const entry = await prisma.payrollEntry.findUnique({
      where: { id: entryId },
      include: {
        items: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
        payrollRun: true,
      },
    });
    if (!entry) throw new NotFoundError('Payslip not found.');
    if (!['Super Admin', 'HR Admin', 'HR Officer'].includes(requester.roleName) && requester.employeeId !== entry.employeeId) {
      throw new BadRequestError('You are not authorized to view this payslip.');
    }
    return entry;
  }
}

export const payrollService = new PayrollService();
