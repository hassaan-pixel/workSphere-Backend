import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting database seed...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@worksphere.io';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@WorkSphere2026!';
  const adminFirstName = process.env.ADMIN_FIRST_NAME || 'System';
  const adminLastName = process.env.ADMIN_LAST_NAME || 'Administrator';

  // 1. Seed Permissions
  console.log('[Seed] Seeding permissions...');
  const permissionsData = [
    // Dashboard
    { code: 'dashboard:view', name: 'View Dashboard', module: 'dashboard', description: 'Access dashboard overview and KPI metrics' },

    // Employees
    { code: 'employees:read', name: 'Read Employees', module: 'employees', description: 'View employee directory and profiles' },
    { code: 'employees:write', name: 'Manage Employees', module: 'employees', description: 'Create and update employee records' },
    { code: 'employees:delete', name: 'Delete Employees', module: 'employees', description: 'Archive or delete employee records' },

    // Departments
    { code: 'departments:read', name: 'Read Departments', module: 'departments', description: 'View department structures' },
    { code: 'departments:write', name: 'Manage Departments', module: 'departments', description: 'Create and edit departments' },

    // Designations
    { code: 'designations:read', name: 'Read Designations', module: 'designations', description: 'View job designations' },
    { code: 'designations:write', name: 'Manage Designations', module: 'designations', description: 'Create and edit designations' },

    // Attendance
    { code: 'attendance:read', name: 'Read Attendance', module: 'attendance', description: 'View attendance logs and timesheets' },
    { code: 'attendance:write', name: 'Manage Attendance', module: 'attendance', description: 'Clock-in/out and manual time edits' },
    { code: 'attendance:manage', name: 'Administer Attendance', module: 'attendance', description: 'Authorize corrections and summaries' },

    // Shifts
    { code: 'shifts:manage', name: 'Manage Shifts', module: 'shifts', description: 'Configure shifts and schedule employee assignments' },

    // Holidays
    { code: 'holidays:manage', name: 'Manage Holidays', module: 'holidays', description: 'Configure organization holiday calendar' },

    // Leave
    { code: 'leave:read', name: 'Read Leave', module: 'leave', description: 'View leave requests and balances' },
    { code: 'leave:write', name: 'Apply Leave', module: 'leave', description: 'Submit leave applications' },
    { code: 'leave:request', name: 'Request Leave', module: 'leave', description: 'Submit personal leave applications' },
    { code: 'leave:read_own', name: 'Read Own Leave', module: 'leave', description: 'View personal leave requests' },
    { code: 'leave:read_team', name: 'Read Team Leave', module: 'leave', description: 'View team members leave requests' },
    { code: 'leave:approve', name: 'Approve Leave', module: 'leave', description: 'Approve or reject leave requests' },
    { code: 'leave:manage', name: 'Manage Leave System', module: 'leave', description: 'Configure policies, balances, and allocations' },

    // Recruitment
    { code: 'recruitment:read', name: 'Read Recruitment', module: 'recruitment', description: 'View job openings and applicants' },
    { code: 'recruitment:write', name: 'Manage Recruitment', module: 'recruitment', description: 'Post jobs and evaluate candidates' },
    { code: 'recruitment:manage', name: 'Administer Recruitment', module: 'recruitment', description: 'Configure pipelines and hire candidates' },

    // Onboarding
    { code: 'onboarding:manage', name: 'Manage Onboarding', module: 'onboarding', description: 'Create templates, assign checklists, and monitor tasks' },

    // Notifications
    { code: 'notifications:read', name: 'Read Notifications', module: 'notifications', description: 'Access user notifications inbox' },

    // Payroll
    { code: 'payroll:read', name: 'Read Payroll', module: 'payroll', description: 'View payslips and salary structures' },
    { code: 'payroll:write', name: 'Manage Payroll', module: 'payroll', description: 'Process salary runs and bonuses' },

    // Performance
    { code: 'performance:read', name: 'Read Performance', module: 'performance', description: 'View appraisal reviews and goals' },
    { code: 'performance:write', name: 'Manage Performance', module: 'performance', description: 'Conduct reviews and assign goals' },

    // Reports
    { code: 'reports:read', name: 'View Reports', module: 'reports', description: 'Generate and view HR analytics' },
    { code: 'reports:export', name: 'Export Reports', module: 'reports', description: 'Export HR reports to CSV/PDF' },

    // Settings & Users
    { code: 'settings:read', name: 'Read Settings', module: 'settings', description: 'View system configurations' },
    { code: 'settings:write', name: 'Manage Settings', module: 'settings', description: 'Update system configurations' },
    { code: 'users:read', name: 'Read Users', module: 'users', description: 'View system user accounts' },
    { code: 'users:write', name: 'Manage Users', module: 'users', description: 'Create and manage user accounts and roles' },
  ];

  for (const perm of permissionsData) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, module: perm.module, description: perm.description },
      create: perm,
    });
  }

  const allPermissions = await prisma.permission.findMany();

  // 2. Seed Roles
  console.log('[Seed] Seeding roles and role-permission mappings...');
  const rolesData = [
    {
      name: 'Super Admin',
      description: 'Full unconstrained administrative access across all modules and settings',
      isSystem: true,
      permissionCodes: allPermissions.map((p) => p.code),
    },
    {
      name: 'HR Admin',
      description: 'Comprehensive human resources management, employee administration, and reporting',
      isSystem: true,
      permissionCodes: [
        'dashboard:view',
        'employees:read', 'employees:write', 'employees:delete',
        'departments:read', 'departments:write',
        'designations:read', 'designations:write',
        'attendance:read', 'attendance:write', 'attendance:manage',
        'shifts:manage', 'holidays:manage',
        'leave:read', 'leave:write', 'leave:request', 'leave:read_own', 'leave:read_team', 'leave:approve', 'leave:manage',
        'recruitment:read', 'recruitment:write', 'recruitment:manage',
        'onboarding:manage',
        'notifications:read',
        'payroll:read', 'payroll:write',
        'performance:read', 'performance:write',
        'reports:read', 'reports:export',
        'settings:read',
        'users:read',
      ],
    },
    {
      name: 'HR Officer',
      description: 'Day-to-day HR operations, onboarding, leave processing, and attendance tracking',
      isSystem: true,
      permissionCodes: [
        'dashboard:view',
        'employees:read', 'employees:write',
        'departments:read',
        'designations:read',
        'attendance:read', 'attendance:write', 'attendance:manage',
        'shifts:manage', 'holidays:manage',
        'leave:read', 'leave:write', 'leave:request', 'leave:read_own', 'leave:read_team', 'leave:approve',
        'recruitment:read', 'recruitment:write',
        'onboarding:manage',
        'notifications:read',
        'reports:read',
      ],
    },
    {
      name: 'Department Manager',
      description: 'Manages departmental team members, approves leaves, and conducts reviews',
      isSystem: true,
      permissionCodes: [
        'dashboard:view',
        'employees:read',
        'departments:read',
        'designations:read',
        'attendance:read',
        'shifts:manage',
        'leave:read', 'leave:write', 'leave:request', 'leave:read_own', 'leave:read_team', 'leave:approve',
        'recruitment:read',
        'notifications:read',
        'performance:read', 'performance:write',
        'reports:read',
      ],
    },
    {
      name: 'Employee',
      description: 'Standard employee portal access for personal profile, attendance, and leave',
      isSystem: true,
      permissionCodes: [
        'dashboard:view',
        'employees:read',
        'attendance:read', 'attendance:write',
        'leave:read', 'leave:write', 'leave:request', 'leave:read_own',
        'notifications:read',
        'performance:read',
      ],
    },
  ];

  const roleMap: Record<string, string> = {};

  for (const roleDef of rolesData) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: { description: roleDef.description },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
    });
    roleMap[role.name] = role.id;

    // Connect permissions
    const validPerms = allPermissions.filter((p) => roleDef.permissionCodes.includes(p.code));
    for (const perm of validPerms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // 3. Seed Departments
  console.log('[Seed] Seeding departments...');
  const departmentsData = [
    { code: 'ENG', name: 'Engineering', description: 'Software engineering, infrastructure, and technical architecture' },
    { code: 'HR', name: 'Human Resources', description: 'People operations, talent acquisition, culture, and employee welfare' },
    { code: 'PROD', name: 'Product & Design', description: 'Product strategy, UI/UX design, and product lifecycle management' },
    { code: 'FIN', name: 'Finance & Accounting', description: 'Financial planning, payroll, audits, and fiscal operations' },
    { code: 'MKT', name: 'Marketing & Growth', description: 'Brand marketing, customer acquisition, content, and communications' },
    { code: 'OPS', name: 'Operations & Legal', description: 'Business operations, legal compliance, and workplace facilities' },
  ];

  const departmentMap: Record<string, string> = {};
  for (const dept of departmentsData) {
    const d = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, description: dept.description },
      create: dept,
    });
    departmentMap[dept.code] = d.id;
  }

  // 4. Seed Designations
  console.log('[Seed] Seeding designations...');
  const designationsData = [
    { code: 'VP_ENG', name: 'VP of Engineering', deptCode: 'ENG', description: 'Head of technical engineering organization' },
    { code: 'SR_SWE', name: 'Senior Software Engineer', deptCode: 'ENG', description: 'Technical lead for core platform systems' },
    { code: 'FS_SWE', name: 'Full Stack Developer', deptCode: 'ENG', description: 'Develops frontend and backend application features' },
    { code: 'DEVOPS', name: 'DevOps & Cloud Engineer', deptCode: 'ENG', description: 'Infrastructure, CI/CD, and site reliability' },

    { code: 'HEAD_HR', name: 'Head of Human Resources', deptCode: 'HR', description: 'Leads people strategy and company culture' },
    { code: 'SR_HR_SPEC', name: 'Senior HR Specialist', deptCode: 'HR', description: 'Employee relations, compensation, and onboarding' },
    { code: 'TA_SPEC', name: 'Talent Acquisition Specialist', deptCode: 'HR', description: 'Recruitment, pipeline development, and interviews' },

    { code: 'VP_PROD', name: 'VP of Product', deptCode: 'PROD', description: 'Directs company-wide product vision and roadmap' },
    { code: 'PROD_MGR', name: 'Senior Product Manager', deptCode: 'PROD', description: 'Oversees product execution and sprint delivery' },
    { code: 'UI_UX_DES', name: 'Lead Product Designer', deptCode: 'PROD', description: 'Design systems, prototyping, and user testing' },

    { code: 'DIR_FIN', name: 'Director of Finance', deptCode: 'FIN', description: 'Fiscal oversight, budgeting, and financial reports' },
    { code: 'SR_FIN_ANL', name: 'Senior Financial Analyst', deptCode: 'FIN', description: 'Financial modeling, revenue analysis, and projections' },

    { code: 'DIR_MKT', name: 'Marketing Director', deptCode: 'MKT', description: 'Brand strategy and go-to-market initiatives' },
    { code: 'GROWTH_MKT', name: 'Growth Marketing Specialist', deptCode: 'MKT', description: 'Digital campaigns, conversion funnels, and analytics' },

    { code: 'DIR_OPS', name: 'Operations Director', deptCode: 'OPS', description: 'Operational scaling, vendor management, and office facilities' },
  ];

  const designationMap: Record<string, string> = {};
  for (const desig of designationsData) {
    const d = await prisma.designation.upsert({
      where: { code: desig.code },
      update: { name: desig.name, description: desig.description },
      create: {
        code: desig.code,
        name: desig.name,
        description: desig.description,
        departmentId: departmentMap[desig.deptCode],
      },
    });
    designationMap[desig.code] = d.id;
  }

  // 5. Seed Employees & Management Hierarchy
  console.log('[Seed] Seeding sample employees...');
  const now = new Date();

  // Root Manager: Marcus Vance (VP of Engineering)
  const empMarcus = await prisma.employee.upsert({
    where: { employeeCode: 'EMP-002' },
    update: {},
    create: {
      employeeCode: 'EMP-002',
      firstName: 'Marcus',
      middleName: 'A.',
      lastName: 'Vance',
      workEmail: 'marcus.vance@worksphere.io',
      personalEmail: 'marcus.vance@example.net',
      phone: '+1 (555) 234-5678',
      dateOfBirth: new Date('1984-06-15'),
      gender: 'MALE',
      hireDate: new Date('2021-03-01'), // 5-year work anniversary upcoming!
      employmentStatus: 'ACTIVE',
      employmentType: 'FULL_TIME',
      departmentId: departmentMap['ENG'],
      designationId: designationMap['VP_ENG'],
      workLocation: 'San Francisco HQ',
    },
  });

  // HR Head: Sarah Jenkins
  const empSarah = await prisma.employee.upsert({
    where: { employeeCode: 'EMP-003' },
    update: {},
    create: {
      employeeCode: 'EMP-003',
      firstName: 'Sarah',
      middleName: 'Louise',
      lastName: 'Jenkins',
      workEmail: 'sarah.jenkins@worksphere.io',
      personalEmail: 'sarah.j@example.net',
      phone: '+1 (555) 345-6789',
      dateOfBirth: new Date(now.getFullYear() - 34, now.getMonth(), (now.getDate() + 5) % 28 + 1), // Upcoming birthday in 5 days!
      gender: 'FEMALE',
      hireDate: new Date('2022-04-10'),
      employmentStatus: 'ACTIVE',
      employmentType: 'FULL_TIME',
      departmentId: departmentMap['HR'],
      designationId: designationMap['HEAD_HR'],
      workLocation: 'New York Office',
    },
  });

  // System Administrator Employee
  const empAdmin = await prisma.employee.upsert({
    where: { employeeCode: 'EMP-001' },
    update: {},
    create: {
      employeeCode: 'EMP-001',
      firstName: adminFirstName,
      lastName: adminLastName,
      workEmail: adminEmail,
      phone: '+1 (555) 100-0001',
      hireDate: new Date('2020-01-15'),
      employmentStatus: 'ACTIVE',
      employmentType: 'FULL_TIME',
      departmentId: departmentMap['OPS'],
      designationId: designationMap['DIR_OPS'],
      workLocation: 'Global Headquarters',
    },
  });

  // Other employees with manager links
  const sampleEmployees = [
    {
      code: 'EMP-004',
      firstName: 'Elena',
      lastName: 'Rostova',
      email: 'elena.rostova@worksphere.io',
      phone: '+1 (555) 456-7890',
      dob: new Date('1992-11-20'),
      gender: 'FEMALE',
      hireDate: new Date(now.getFullYear() - 2, now.getMonth(), (now.getDate() + 12) % 28 + 1), // 2-year anniversary in 12 days!
      status: 'ACTIVE',
      type: 'FULL_TIME',
      dept: 'ENG',
      desig: 'SR_SWE',
      managerId: empMarcus.id,
      location: 'Remote - US',
    },
    {
      code: 'EMP-005',
      firstName: 'David',
      lastName: 'Chen',
      email: 'david.chen@worksphere.io',
      phone: '+1 (555) 567-8901',
      dob: new Date(now.getFullYear() - 29, now.getMonth(), (now.getDate() + 18) % 28 + 1), // Birthday in 18 days!
      gender: 'MALE',
      hireDate: new Date('2023-01-16'),
      status: 'ACTIVE',
      type: 'FULL_TIME',
      dept: 'HR',
      desig: 'SR_HR_SPEC',
      managerId: empSarah.id,
      location: 'New York Office',
    },
    {
      code: 'EMP-006',
      firstName: 'Samantha',
      lastName: 'Miller',
      email: 'samantha.miller@worksphere.io',
      phone: '+1 (555) 678-9012',
      dob: new Date('1990-08-14'),
      gender: 'FEMALE',
      hireDate: new Date('2023-05-01'),
      status: 'ACTIVE',
      type: 'FULL_TIME',
      dept: 'PROD',
      desig: 'PROD_MGR',
      managerId: null,
      location: 'San Francisco HQ',
    },
    {
      code: 'EMP-007',
      firstName: 'Carlos',
      lastName: 'Mendez',
      email: 'carlos.mendez@worksphere.io',
      phone: '+1 (555) 789-0123',
      dob: new Date('1988-12-05'),
      gender: 'MALE',
      hireDate: new Date('2022-09-15'),
      status: 'ON_LEAVE', // On leave sample!
      type: 'FULL_TIME',
      dept: 'FIN',
      desig: 'SR_FIN_ANL',
      managerId: null,
      location: 'Chicago Office',
    },
    {
      code: 'EMP-008',
      firstName: 'Amara',
      lastName: 'Okafor',
      email: 'amara.okafor@worksphere.io',
      phone: '+1 (555) 890-1234',
      dob: new Date('1995-03-22'),
      gender: 'FEMALE',
      hireDate: new Date('2024-02-01'),
      status: 'ACTIVE',
      type: 'FULL_TIME',
      dept: 'ENG',
      desig: 'FS_SWE',
      managerId: empMarcus.id,
      location: 'Remote - Canada',
    },
    {
      code: 'EMP-009',
      firstName: 'Liam',
      lastName: "O'Connor",
      email: 'liam.oconnor@worksphere.io',
      phone: '+1 (555) 901-2345',
      dob: new Date('1993-07-30'),
      gender: 'MALE',
      hireDate: new Date('2023-11-15'),
      status: 'ACTIVE',
      type: 'FULL_TIME',
      dept: 'MKT',
      desig: 'GROWTH_MKT',
      managerId: null,
      location: 'Austin Office',
    },
    {
      code: 'EMP-010',
      firstName: 'Priya',
      lastName: 'Patel',
      email: 'priya.patel@worksphere.io',
      phone: '+1 (555) 012-3456',
      dob: new Date('1994-09-18'),
      gender: 'FEMALE',
      hireDate: new Date('2024-06-10'),
      status: 'PROBATION',
      type: 'FULL_TIME',
      dept: 'ENG',
      desig: 'DEVOPS',
      managerId: empMarcus.id,
      location: 'San Francisco HQ',
    },
  ];

  const empRecordMap: Record<string, string> = {
    'EMP-001': empAdmin.id,
    'EMP-002': empMarcus.id,
    'EMP-003': empSarah.id,
  };

  for (const emp of sampleEmployees) {
    const created = await prisma.employee.upsert({
      where: { employeeCode: emp.code },
      update: {},
      create: {
        employeeCode: emp.code,
        firstName: emp.firstName,
        lastName: emp.lastName,
        workEmail: emp.email,
        phone: emp.phone,
        dateOfBirth: emp.dob,
        gender: emp.gender,
        hireDate: emp.hireDate,
        employmentStatus: emp.status,
        employmentType: emp.type,
        departmentId: departmentMap[emp.dept],
        designationId: designationMap[emp.desig],
        reportingManagerId: emp.managerId,
        workLocation: emp.location,
      },
    });
    empRecordMap[emp.code] = created.id;
  }

  // 6. Seed User Accounts linked to Roles and optional Employees
  console.log('[Seed] Seeding user accounts...');
  const saltRounds = 12;

  // 6a. Super Admin User
  const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
      roleId: roleMap['Super Admin'],
      employeeId: empAdmin.id,
      isActive: true,
    },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      roleId: roleMap['Super Admin'],
      employeeId: empAdmin.id,
      isActive: true,
    },
  });

  // 6b. HR Admin User (Sarah Jenkins)
  const hrAdminHash = await bcrypt.hash('HrAdmin@123!', saltRounds);
  await prisma.user.upsert({
    where: { email: 'hr.admin@worksphere.io' },
    update: {
      passwordHash: hrAdminHash,
      roleId: roleMap['HR Admin'],
      employeeId: empSarah.id,
    },
    create: {
      email: 'hr.admin@worksphere.io',
      passwordHash: hrAdminHash,
      roleId: roleMap['HR Admin'],
      employeeId: empSarah.id,
      isActive: true,
    },
  });

  // 6c. HR Officer User (David Chen)
  const hrOfficerHash = await bcrypt.hash('Officer@123!', saltRounds);
  await prisma.user.upsert({
    where: { email: 'hrofficer.chen@worksphere.io' },
    update: {
      passwordHash: hrOfficerHash,
      roleId: roleMap['HR Officer'],
      employeeId: empRecordMap['EMP-005'],
    },
    create: {
      email: 'hrofficer.chen@worksphere.io',
      passwordHash: hrOfficerHash,
      roleId: roleMap['HR Officer'],
      employeeId: empRecordMap['EMP-005'],
      isActive: true,
    },
  });

  // 6d. Department Manager User (Marcus Vance)
  const managerHash = await bcrypt.hash('Manager@123!', saltRounds);
  await prisma.user.upsert({
    where: { email: 'manager.vance@worksphere.io' },
    update: {
      passwordHash: managerHash,
      roleId: roleMap['Department Manager'],
      employeeId: empMarcus.id,
    },
    create: {
      email: 'manager.vance@worksphere.io',
      passwordHash: managerHash,
      roleId: roleMap['Department Manager'],
      employeeId: empMarcus.id,
      isActive: true,
    },
  });

  // 6e. Standard Employee User (Elena Rostova)
  const employeeHash = await bcrypt.hash('Employee@123!', saltRounds);
  await prisma.user.upsert({
    where: { email: 'employee.elena@worksphere.io' },
    update: {
      passwordHash: employeeHash,
      roleId: roleMap['Employee'],
      employeeId: empRecordMap['EMP-004'],
    },
    create: {
      email: 'employee.elena@worksphere.io',
      passwordHash: employeeHash,
      roleId: roleMap['Employee'],
      employeeId: empRecordMap['EMP-004'],
      isActive: true,
    },
  });

  // 7. Seed Application Settings
  console.log('[Seed] Seeding application settings...');
  const settingsData = [
    { key: 'company.name', value: 'WorkSphere Technologies Inc.', description: 'Legal company name', category: 'general' },
    { key: 'company.timezone', value: 'America/New_York', description: 'Default system timezone', category: 'general' },
    { key: 'company.date_format', value: 'YYYY-MM-DD', description: 'Global date display format', category: 'localization' },
    { key: 'company.currency', value: 'USD', description: 'Standard operating currency', category: 'payroll' },
    { key: 'auth.session_timeout_hours', value: '168', description: 'Session duration in hours', category: 'security' },
    { key: 'attendance.standard_work_hours', value: '8', description: 'Standard daily working hours', category: 'attendance' },
  ];

  for (const s of settingsData) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: s,
    });
  }

  // 8. Seed Shifts
  console.log('[Seed] Seeding shifts...');
  const shiftsData = [
    {
      code: 'MORN_STD',
      name: 'Standard Morning Shift',
      startTime: '09:00',
      endTime: '17:00',
      breakDurationMinutes: 60,
      expectedHours: 8.0,
      applicableDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
      gracePeriodMinutes: 15,
      isOvernight: false,
    },
    {
      code: 'EARLY_OPS',
      name: 'Early Operations Shift',
      startTime: '06:00',
      endTime: '14:00',
      breakDurationMinutes: 45,
      expectedHours: 8.0,
      applicableDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
      gracePeriodMinutes: 15,
      isOvernight: false,
    },
    {
      code: 'EVENING_SUP',
      name: 'Evening Support Shift',
      startTime: '14:00',
      endTime: '22:00',
      breakDurationMinutes: 45,
      expectedHours: 8.0,
      applicableDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
      gracePeriodMinutes: 15,
      isOvernight: false,
    },
    {
      code: 'NIGHT_DEV',
      name: 'Overnight Engineering Shift',
      startTime: '22:00',
      endTime: '06:00',
      breakDurationMinutes: 60,
      expectedHours: 8.0,
      applicableDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY',
      gracePeriodMinutes: 15,
      isOvernight: true,
    },
  ];

  const shiftMap: Record<string, string> = {};
  for (const s of shiftsData) {
    const shift = await prisma.shift.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
    shiftMap[s.code] = shift.id;
  }

  // Assign standard shift to all seeded employees
  const allEmployees = await prisma.employee.findMany();
  for (const emp of allEmployees) {
    const existingAssign = await prisma.shiftAssignment.findFirst({
      where: { employeeId: emp.id, isActive: true },
    });
    if (!existingAssign) {
      await prisma.shiftAssignment.create({
        data: {
          employeeId: emp.id,
          shiftId: shiftMap['MORN_STD'],
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          isActive: true,
        },
      });
    }
  }

  // 9. Seed Leave Types & Balances
  console.log('[Seed] Seeding leave types & balances...');
  const leaveTypesData = [
    { code: 'ANNUAL', name: 'Annual Paid Leave', description: 'Standard accrued annual paid time off', defaultDaysPerYear: 15, isPaid: true, requiresApproval: true, color: '#0d9488' },
    { code: 'SICK', name: 'Medical / Sick Leave', description: 'Paid medical leave for illness or appointments', defaultDaysPerYear: 10, isPaid: true, requiresApproval: true, color: '#ef4444' },
    { code: 'CASUAL', name: 'Casual Leave', description: 'Short notice personal time off', defaultDaysPerYear: 5, isPaid: true, requiresApproval: true, color: '#f59e0b' },
    { code: 'PARENTAL', name: 'Parental / Maternity Leave', description: 'Paid family and child bonding leave', defaultDaysPerYear: 60, isPaid: true, requiresApproval: true, color: '#8b5cf6' },
    { code: 'UNPAID', name: 'Leave Without Pay', description: 'Authorized unpaid leave of absence', defaultDaysPerYear: 30, isPaid: false, requiresApproval: true, color: '#64748b' },
  ];

  const leaveTypeMap: Record<string, string> = {};
  for (const lt of leaveTypesData) {
    const l = await prisma.leaveType.upsert({
      where: { code: lt.code },
      update: lt,
      create: lt,
    });
    leaveTypeMap[lt.code] = l.id;
  }

  // Seed 2026 Leave Balances for all employees
  for (const emp of allEmployees) {
    for (const lt of leaveTypesData) {
      const typeId = leaveTypeMap[lt.code];
      await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: emp.id,
            leaveTypeId: typeId,
            year: 2026,
          },
        },
        update: {},
        create: {
          employeeId: emp.id,
          leaveTypeId: typeId,
          year: 2026,
          entitlement: lt.defaultDaysPerYear,
          used: 0,
          pending: 0,
        },
      });
    }
  }

  // 10. Seed Holidays for 2026
  console.log('[Seed] Seeding 2026 holidays...');
  const holidaysData = [
    { name: "New Year's Day", date: new Date('2026-01-01T00:00:00.000Z'), holidayType: 'PUBLIC', description: 'International New Year holiday' },
    { name: 'Memorial Day', date: new Date('2026-05-25T00:00:00.000Z'), holidayType: 'PUBLIC', description: 'National Memorial Day' },
    { name: 'Independence Day', date: new Date('2026-07-04T00:00:00.000Z'), holidayType: 'PUBLIC', description: 'US Independence Day' },
    { name: 'Labor Day', date: new Date('2026-09-07T00:00:00.000Z'), holidayType: 'PUBLIC', description: 'National Labor Day' },
    { name: 'Thanksgiving Day', date: new Date('2026-11-26T00:00:00.000Z'), holidayType: 'PUBLIC', description: 'Thanksgiving holiday' },
    { name: 'Christmas Day', date: new Date('2026-12-25T00:00:00.000Z'), holidayType: 'PUBLIC', description: 'Christmas Day holiday' },
  ];

  for (const h of holidaysData) {
    const existing = await prisma.holiday.findFirst({
      where: { name: h.name, date: h.date },
    });
    if (!existing) {
      await prisma.holiday.create({ data: h });
    }
  }

  // 11. Seed Onboarding Templates
  console.log('[Seed] Seeding onboarding templates...');
  const existingTpl = await prisma.onboardingTemplate.findFirst({
    where: { name: 'Standard Employee Onboarding' },
  });
  if (!existingTpl) {
    await prisma.onboardingTemplate.create({
      data: {
        name: 'Standard Employee Onboarding',
        description: 'Default onboarding checklist for newly joined team members',
        items: {
          create: [
            { title: 'Provision Work Laptop & Email Account', description: 'Issue hardware, setup corporate email and 2FA credentials', defaultDueDays: 1, category: 'IT_SETUP', order: 1 },
            { title: 'Sign Employee Handbook & NDA', description: 'Acknowledge corporate compliance policies and employment terms', defaultDueDays: 2, category: 'HR_PAPERWORK', order: 2 },
            { title: 'Direct Deposit & Tax Documents', description: 'Submit bank routing and W-4 tax withholding forms', defaultDueDays: 3, category: 'HR_PAPERWORK', order: 3 },
            { title: 'Manager 1-on-1 & Team Introduction', description: 'Initial alignment session, intro to team tools and repos', defaultDueDays: 5, category: 'ORIENTATION', order: 4 },
            { title: '30-Day Check-in & Goal Setting', description: 'First month retrospective, feedback, and milestone planning', defaultDueDays: 30, category: 'TRAINING', order: 5 },
          ],
        },
      },
    });
  }

  console.log('----------------------------------------------------');
  console.log('[Seed] Database seeded successfully!');
  console.log('----------------------------------------------------');
  console.log('Default Credentials:');
  console.log(`  Super Admin:        ${adminEmail} / ${adminPassword}`);
  console.log(`  HR Admin:           hr.admin@worksphere.io / HrAdmin@123!`);
  console.log(`  HR Officer:         hrofficer.chen@worksphere.io / Officer@123!`);
  console.log(`  Department Manager: manager.vance@worksphere.io / Manager@123!`);
  console.log(`  Employee:           employee.elena@worksphere.io / Employee@123!`);
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('[Seed] Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
