# WorkSphere — Enterprise HR & Employee Management System (Backend)

WorkSphere Backend is a modular monolith built with **Node.js 22**, **Express**, **TypeScript**, **SQLite**, and **Prisma ORM**.

## Tech Stack & Architecture

- **Runtime**: Node.js 22 LTS
- **Framework**: Express.js
- **Database**: SQLite with Prisma ORM (persistent file-based database at `prisma/dev.db`)
- **Authentication**: JWT (JSON Web Tokens) with dual support for Bearer Authorization headers and secure HttpOnly cookies
- **Validation**: Zod schema validation middleware
- **Security**: Helmet security headers, CORS with credentials, sensitive request data sanitization, bcrypt (salt rounds: 12)
- **Architecture**: Modular monolith with separation of concerns (`common`, `config`, `database`, `modules`, `routes`)

---

## Directory Structure

```
worksphere_backend/
├── prisma/
│   ├── schema.prisma         # Relational database schema with indexes and constraints
│   ├── migrations/           # Committed migrations
│   └── seed.ts               # Repeatable seed script with realistic organizational data
├── src/
│   ├── app.ts                # Express application setup, middlewares, and route mounting
│   ├── server.ts             # Server bootstrap, port listening, and graceful shutdown
│   ├── config/
│   │   └── environment.ts    # Environment configuration and validation
│   ├── common/
│   │   ├── errors/           # Standardized error hierarchy (AppError, ValidationError, etc.)
│   │   ├── middleware/       # Auth, permissions, request validation, error handler, logger
│   │   └── utils/            # JWT helpers, bcrypt hashing, API response formatting, pagination
│   ├── database/
│   │   └── prisma.ts         # Prisma client singleton and lifecycle management
│   ├── modules/
│   │   ├── auth/             # Login, logout, current-user endpoints, session auditing
│   │   ├── dashboard/        # Real-time workforce metrics, department distribution, anniversaries
│   │   ├── employees/        # Directory listing with search/filtering, employee details
│   │   ├── departments/      # Department listing with headcount counters
│   │   ├── designations/     # Role profile hierarchy and active member stats
│   │   └── users/            # User account management with role-based access control
│   └── routes/
│       └── index.ts          # Root API router (/api) and /health endpoint
└── tests/
    ├── auth.test.ts          # Authentication, token generation, and cookie integration tests
    ├── hash.test.ts          # Bcrypt password hashing and verification tests
    ├── health.test.ts        # Health check and 404 handler tests
    └── permissions.test.ts   # RBAC, granular permission enforcement, and IDOR protection tests
```

---

## Prerequisites

- **Node.js**: Node.js >= 22.0.0
- **npm**: npm >= 10.0.0

---

## Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default variables:
```env
PORT=5000
NODE_ENV=development
API_PREFIX=/api
CORS_ORIGIN=http://localhost:4200
DATABASE_URL="file:./dev.db"
JWT_SECRET=worksphere_development_jwt_secret_key_38f9b20e71d491
JWT_EXPIRES_IN=7d

# Initial Administrator Seed
ADMIN_EMAIL=admin@worksphere.io
ADMIN_PASSWORD=Admin@WorkSphere2026!
ADMIN_FIRST_NAME=System
ADMIN_LAST_NAME=Administrator
```

---

## Installation & Database Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Generate Prisma Client**:
   ```bash
   npm run prisma:generate
   ```

3. **Run Migrations**:
   ```bash
   npm run prisma:migrate
   ```

4. **Seed Database**:
   ```bash
   npm run seed
   ```

---

## Pre-seeded Demo Accounts

| Role | Email | Password |
|---|---|---|
| **Super Admin** | `admin@worksphere.io` | `Admin@WorkSphere2026!` |
| **HR Admin** | `hr.admin@worksphere.io` | `HrAdmin@123!` |
| **HR Officer** | `hrofficer.chen@worksphere.io` | `Officer@123!` |
| **Department Manager** | `manager.vance@worksphere.io` | `Manager@123!` |
| **Standard Employee** | `employee.elena@worksphere.io` | `Employee@123!` |

---

## Available Scripts

- `npm run dev`: Starts the development server with live reload (`tsx watch src/server.ts`).
- `npm run build`: Compiles TypeScript into `dist/`.
- `npm start`: Runs the production build (`node dist/server.js`).
- `npm test`: Runs the automated Jest test suite.
- `npm run prisma:generate`: Re-generates Prisma Client.
- `npm run prisma:migrate`: Runs pending Prisma migrations.
- `npm run prisma:seed`: Seeds database with realistic development records.

---

## API Endpoints Overview

### Core & Authentication
- `GET /api/health` — Service health, uptime, environment, and database connectivity.
- `POST /api/auth/login` — Authenticate user, issue JWT token and HttpOnly cookie.
- `POST /api/auth/logout` — Revoke session and clear auth cookie.
- `GET /api/auth/me` — Retrieve current authenticated user profile, linked employee, and permissions.
- `GET /api/dashboard/metrics` — Aggregated workforce metrics (total, active, on-leave, department distribution, milestones, recent additions).

### Organization & Employee Directory
- `GET /api/employees` — Paginated and searchable employee directory with multi-field filters.
- `GET /api/employees/:id` — Employee profile details with IDOR protection.
- `POST /api/employees` — Create new employee record.
- `PUT /api/employees/:id` — Update existing employee record.
- `DELETE /api/employees/:id` — Soft-delete employee.
- `GET /api/departments` — List of departments with headcount.
- `GET /api/designations` — List of job designations and staffing counts.
- `GET /api/users` — User management (Super Admin / HR Admin only).

### Attendance & Shifts (Phase 3)
- `POST /api/attendance/clock-in` — Clock in for the workday (creates attendance record & session, prevents double clock-in).
- `POST /api/attendance/clock-out` — Clock out from current active session and calculate worked minutes & overtime.
- `POST /api/attendance/manual` — Supervisor manual attendance record creation or punch correction with audit justification.
- `GET /api/attendance` — List and filter daily attendance records by date, employee, department, and status.
- `GET /api/attendance/summary` — Aggregate attendance metrics (present, late, absent, on-leave, worked hours, overtime hours).
- `GET /api/attendance/monthly/:employeeId` — Monthly attendance calendar for an employee.
- `GET /api/attendance/export` — Authorized CSV export of filtered attendance data.
- `GET /api/shifts` — List configured shifts with active days, timings, and grace periods.
- `POST /api/shifts` — Create new shift schedule (handles overnight shifts without negative duration).
- `PUT /api/shifts/:id` — Update shift configuration.
- `DELETE /api/shifts/:id` — Remove shift schedule.
- `POST /api/shifts/assign` — Assign shift schedule to an employee with effective dates.
- `GET /api/shifts/employee/:employeeId` — Shift assignment history for an employee.

### Leave & Absence (Phase 3)
- `GET /api/leave/types` — List configured leave types (entitlement days, paid/unpaid status).
- `POST /api/leave/types` — Create custom leave policy type.
- `GET /api/leave/balances/:employeeId` — Fetch annual leave balance, used days, pending days, and remaining allowance.
- `POST /api/leave/requests` — Submit leave request (validates balance, prevents overlaps, calculates working days excluding weekends/holidays).
- `GET /api/leave/requests` — List leave requests (supports self-service and management filtering).
- `GET /api/leave/requests/approvals` — Supervisor and HR inbox of pending leave requests.
- `POST /api/leave/requests/:id/review` — Review leave request (APPROVE / REJECT) with decision comments (blocks self-approval).
- `POST /api/leave/requests/:id/cancel` — Cancel pending leave request and restore balances.
- `GET /api/leave/calendar` — Departmental and organizational leave calendar.
- `GET /api/holidays` — List organization holidays.
- `POST /api/holidays` — Create public or optional holiday with location/department scope.
- `DELETE /api/holidays/:id` — Delete holiday entry.

### Recruitment & Onboarding (Phase 3)
- `GET /api/recruitment/openings` — List job requisitions by status and department.
- `POST /api/recruitment/openings` — Create new job opening.
- `PUT /api/recruitment/openings/:id` — Update job opening status and details.
- `GET /api/recruitment/candidates` — Filter candidates across pipeline stages (`APPLIED`, `SCREENING`, `INTERVIEW`, `OFFER`, `HIRED`, `REJECTED`).
- `POST /api/recruitment/candidates` — Register applicant for an open position.
- `POST /api/recruitment/candidates/:id/stage` — Move candidate stage with interviewer/recruiter feedback log.
- `POST /api/recruitment/candidates/:id/hire` — Convert candidate to employee record and trigger onboarding tasks.
- `GET /api/onboarding/templates` — List standardized onboarding templates.
- `GET /api/onboarding/employee/:employeeId` — Retrieve active onboarding checklist and completion progress for an employee.
- `POST /api/onboarding/employee/:employeeId/generate` — Generate checklist from template.
- `PATCH /api/onboarding/tasks/:id/status` — Mark onboarding task as `IN_PROGRESS` or `COMPLETED`.

---

## Business Logic & Design Rules

1. **Deterministic Date & Time Handling**:
   - Dates are normalized to UTC `00:00:00.000Z` to avoid timezone shifts between browser clients and the server.
   - Leave duration automatically calculates working days while strictly excluding weekends (Saturday/Sunday) and official organization holidays matching the employee's location/department.

2. **Shift Scheduling & Overnight Logic**:
   - Shifts that span midnight (e.g., 22:00 to 06:00) calculate total duration modulo 24 hours (`(end - start + 24) % 24`), preventing negative hours or invalid overtime.

3. **Attendance Record Integrity**:
   - Workdays enforce a unique constraint per employee per day (`employeeId` + `workDate`).
   - Clock-in and clock-out operate on explicit sessions without overwriting history.
   - Manual supervisor edits and punch adjustments require a mandatory justification reason and are immutably logged to the audit table.

4. **Self-Approval Prevention**:
   - Employees are blocked from approving their own leave requests. Approval requests require an authorized reviewer with `leave:approve` permission who is not the applicant.

5. **Safe Balance Deduction & Cancellation**:
   - Leave requests lock pending days upon application. Approval transitions pending days to deducted days. Cancellation safely frees the reserved days without duplicate deductions.

6. **Candidate-to-Employee Conversion**:
   - Hiring a candidate runs inside a database transaction: creates the employee record, updates the candidate's stage to `HIRED`, associates `hiredEmployeeId`, logs stage history, and automatically generates the onboarding checklist.
