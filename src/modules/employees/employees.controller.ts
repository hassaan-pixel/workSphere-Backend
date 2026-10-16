import { Request, Response, NextFunction } from 'express';
import { employeesService, EmployeeFilters } from './employees.service';
import { parsePaginationParams } from '../../common/utils/pagination.utils';
import { sendPaginated, sendSuccess } from '../../common/utils/response.utils';

export class EmployeesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const pagination = parsePaginationParams(req);
      const filters: EmployeeFilters = {
        departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
        designationId: typeof req.query.designationId === 'string' ? req.query.designationId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        employmentType: typeof req.query.employmentType === 'string' ? req.query.employmentType : undefined,
        hireDateFrom: typeof req.query.hireDateFrom === 'string' ? req.query.hireDateFrom : undefined,
        hireDateTo: typeof req.query.hireDateTo === 'string' ? req.query.hireDateTo : undefined,
      };

      const { items, total } = await employeesService.listEmployees(pagination, filters);
      sendPaginated(res, items, total, pagination.page, pagination.limit, 'Employees list retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await employeesService.getEmployeeById(req.params.id);
      sendSuccess(res, employee, 'Employee details retrieved');
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await employeesService.createEmployee(req.body);
      sendSuccess(res, employee, 'Employee created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await employeesService.updateEmployee(req.params.id, req.body);
      sendSuccess(res, employee, 'Employee updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await employeesService.deleteEmployee(req.params.id);
      sendSuccess(res, result, 'Employee deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const employeesController = new EmployeesController();
