// ============================================
// User & Auth Types
// ============================================

export enum Role {
  ADMIN = 'ADMIN',
  VENDEDOR = 'VENDEDOR',
  CLIENTE = 'CLIENTE',
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
}

// ============================================
// Loan Types
// ============================================

export enum LoanStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAID = 'PAID',
  DEFAULTED = 'DEFAULTED',
  CANCELLED = 'CANCELLED',
  REFINANCIADO = 'REFINANCIADO',
}

export enum PaymentFrequency {
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
}

export interface LoanSimulation {
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: PaymentFrequency;
}

export interface LoanSimulationResult {
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  schedule: InstallmentScheduleItem[];
}

export interface InstallmentScheduleItem {
  number: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  capitalBalance: number;
}

export interface Loan {
  id: string;
  clientId: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: PaymentFrequency;
  status: LoanStatus;
  totalInterest: number;
  totalPayment: number;
  installmentAmount: number;
  createdAt: string;
}

// ============================================
// Payment Types
// ============================================

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface Payment {
  id: string;
  loanId: string;
  installmentId?: string;
  amount: number;
  type: string;
  status: PaymentStatus;
  reference?: string;
  processedAt?: string;
  createdAt: string;
}

// ============================================
// Collection Types
// ============================================

export enum CollectionActionType {
  CALL = 'CALL',
  VISIT = 'VISIT',
  AGREEMENT = 'AGREEMENT',
  REFINANCING = 'REFINANCING',
  LEGAL = 'LEGAL',
  PROMISE = 'PROMISE',
}

export enum AmortizationSystemType {
  FRENCH = 'FRENCH',
  GERMAN = 'GERMAN',
  FLAT_RATE = 'FLAT_RATE',
}

export interface CollectionAction {
  id: string;
  loanId: string;
  type: CollectionActionType;
  description: string;
  result?: string;
  nextAction?: string;
  followUpDate?: string;
  createdAt: string;
}

// ============================================
// Dashboard Types
// ============================================

export interface DashboardMetrics {
  totalLoans: number;
  activeLoans: number;
  totalDisbursed: number;
  totalCollected: number;
  futureCollectionAmount: number;
  pendingApprovals: number;
}

// ============================================
// Backup Types
// ============================================

export type BackupType = 'MANUAL' | 'SCHEDULED' | 'UPLOADED';
export type BackupStatus = 'COMPLETED' | 'FAILED' | 'RESTORING';

export interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  type: BackupType;
  status: BackupStatus;
  checksum?: string;
  tablesMeta?: Array<{ name: string; rowCount: number }>;
  error?: string;
  createdAt: string;
}

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number; // 0-23
  dayOfWeek?: number; // 0-6 (Sunday-Saturday)
  dayOfMonth?: number; // 1-31
}

export interface RetentionConfig {
  maxCount?: number;
  maxAgeDays?: number;
}

export interface RestorePreview {
  tables: Array<{ name: string; rowCount: number }>;
  totalTables: number;
  fileSizeBytes: number;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
