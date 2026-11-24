export type Role = "ADMIN" | "EMPLOYEE";
export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "HALF_DAY"
  | "ON_LEAVE"
  | "PENDING_VERIFICATION"
  | "REJECTED";
export type DayStatus = AttendanceStatus | "WEEKEND" | "UPCOMING" | "NOT_JOINED";
export type VerificationStatus = "AUTO_APPROVED" | "PENDING" | "APPROVED" | "REJECTED";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type EmploymentStatus = "ACTIVE" | "PROBATION" | "NOTICE" | "INACTIVE" | "TERMINATED";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface Me {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  company: { name: string; timezone: string };
  employee: {
    id: string;
    name: string;
    firstName: string;
    employeeCode: string;
    designation: string;
    avatarUrl: string | null;
  } | null;
}

export interface AttendanceRecord {
  id: string;
  workDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  workedMinutes: number | null;
  breakMinutes: number;
  status: AttendanceStatus;
  verificationStatus: VerificationStatus;
  isLate: boolean;
  lateMinutes: number;
  isEarlyDeparture: boolean;
  earlyMinutes: number;
  isRemote: boolean;
  flags: string[];
  riskScore: number;
  adminNote: string | null;
}

export interface TodayState {
  serverTime: string;
  workDate: string;
  timezone: string;
  schedule: {
    name: string;
    start: string;
    end: string;
    graceMinutes: number;
    breakMinutes: number;
    isWorkDay: boolean;
    scheduledMinutes: number;
  };
  office: { name: string; latitude: number; longitude: number; radiusMeters: number } | null;
  policy: { allowRemote: boolean; requireCheckoutSelfie: boolean; maxGpsAccuracyMeters: number };
  state: "NOT_CHECKED_IN" | "CHECKED_IN" | "COMPLETED" | "ON_LEAVE";
  leave: { type: string; halfDay: boolean } | null;
  attendance: AttendanceRecord | null;
}

export interface DaySummary {
  date: string;
  status: DayStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  isLate: boolean;
  lateMinutes: number;
  isEarlyDeparture: boolean;
  earlyMinutes: number;
}

export interface EmployeeSummary {
  from: string;
  to: string;
  scheduledMinutesPerDay: number;
  totals: {
    present: number;
    late: number;
    absent: number;
    halfDay: number;
    onLeave: number;
    earlyDepartures: number;
    workedMinutes: number;
    avgWorkedMinutes: number;
    attendanceRate: number;
  };
  days: DaySummary[];
}

export interface LeaveBalance {
  id: string;
  year: number;
  leaveType: { id: string; name: string; code: string; color: string; isPaid: boolean };
  allocated: number;
  used: number;
  pending: number;
  available: number;
}

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  halfDay: boolean;
  reason: string;
  status: LeaveStatus;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  leaveType: { id: string; name: string; color: string; code: string } | null;
  employee: { id: string; name: string; employeeCode: string; department: string | null } | null;
  reviewer: string | null;
}

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  phone: string | null;
  avatarUrl: string | null;
  designation: string;
  joiningDate: string;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContact: string | null;
  status: EmploymentStatus;
  allowRemote: boolean;
  department: { id: string; name: string; color: string } | null;
  manager: { id: string; name: string } | null;
  workSchedule: { id: string; name: string } | null;
  officeLocation: { id: string; name: string } | null;
  createdAt: string;
}

export interface Lookups {
  departments: { id: string; name: string; color: string }[];
  schedules: { id: string; name: string; isDefault: boolean }[];
  offices: { id: string; name: string; isDefault: boolean }[];
  leaveTypes: { id: string; name: string; color: string; isActive: boolean }[];
  employees: { id: string; name: string; employeeCode: string; status: EmploymentStatus }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
