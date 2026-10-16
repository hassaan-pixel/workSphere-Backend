import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../../common/middleware/auth.middleware';
import { validateRequest } from '../../common/middleware/validate.middleware';
import { sendSuccess } from '../../common/utils/response.utils';
import { payrollService } from './payroll.service';
import { payrollRunSchema, salaryStructureSchema } from './payroll.schema';

const router = Router();
router.use(authenticate);
router.get('/salary-structures', requirePermission('payroll:read'), async (req: Request, res: Response, next: NextFunction) => { try { sendSuccess(res, await payrollService.listSalaryStructures(typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined)); } catch (error) { next(error); } });
router.get('/structures', requirePermission('payroll:read'), async (req: Request, res: Response, next: NextFunction) => { try { sendSuccess(res, await payrollService.listSalaryStructures(typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined)); } catch (error) { next(error); } });
router.post('/salary-structures', requirePermission('payroll:write'), validateRequest({ body: salaryStructureSchema }), async (req: Request, res: Response, next: NextFunction) => { try { sendSuccess(res, await payrollService.createSalaryStructure(req.body, req.user!.id), 'Salary structure saved.', 201); } catch (error) { next(error); } });
router.post('/structures', requirePermission('payroll:write'), validateRequest({ body: salaryStructureSchema }), async (req: Request, res: Response, next: NextFunction) => { try { sendSuccess(res, await payrollService.createSalaryStructure(req.body, req.user!.id), 'Salary structure saved.', 201); } catch (error) { next(error); } });
router.get('/runs', requirePermission('payroll:read'), async (_req, res, next) => { try { sendSuccess(res, await payrollService.listRuns()); } catch (error) { next(error); } });
router.post('/runs', requirePermission('payroll:write'), validateRequest({ body: payrollRunSchema }), async (req, res, next) => { try { sendSuccess(res, await payrollService.createRun(req.body, req.user!.id), 'Payroll run created.', 201); } catch (error) { next(error); } });
router.get('/runs/:id', requirePermission('payroll:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, await payrollService.getRunDetails(req.params.id));
  } catch (error) {
    next(error);
  }
});
router.get('/runs/:id/export', requirePermission('payroll:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const csv = await payrollService.getRunCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-run-${req.params.id}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});
router.post('/runs/:id/process', requirePermission('payroll:write'), async (req, res, next) => { try { sendSuccess(res, await payrollService.processRun(req.params.id, req.user!.id), 'Payroll run processed.'); } catch (error) { next(error); } });
router.post('/runs/:id/approve', requirePermission('payroll:approve'), async (req, res, next) => { try { sendSuccess(res, await payrollService.transitionRun(req.params.id, 'approve', req.user!.id), 'Payroll run approved.'); } catch (error) { next(error); } });
router.post('/runs/:id/finalize', requirePermission('payroll:approve'), async (req, res, next) => { try { sendSuccess(res, await payrollService.transitionRun(req.params.id, 'finalize', req.user!.id), 'Payroll run finalized.'); } catch (error) { next(error); } });
router.get('/payslips/:entryId', async (req, res, next) => { try { sendSuccess(res, await payrollService.getPayslip(req.params.entryId, req.user!)); } catch (error) { next(error); } });
export default router;
