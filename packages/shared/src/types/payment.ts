// ============================================
// Payment Types - API DTOs and Responses
// ============================================

// Local enums to avoid Prisma dependency in shared package
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum InstallmentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  PARTIAL = 'PARTIAL',
}

// DTO for creating a payment
export interface CreatePaymentDTO {
  loanId: string;
  installmentId?: string;
  amount: number;
  reference?: string;
  notes?: string;
}

// Response for created payment
export interface PaymentResponse {
  id: string;
  loanId: string;
  installmentId?: string;
  amount: number;
  status: PaymentStatus;
  reference?: string;
  processedAt?: string;
  createdAt: string;
}

// Installment with balance info
export interface InstallmentWithBalance {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
  balance: number;
  paidAmount: number;
  moraAmount: number;
  status: InstallmentStatus;
  daysOverdue: number;
}

// Installment summary for loan detail view
export interface InstallmentSummary {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  balance: number;
  paidAmount: number;
  moraAmount: number;
  status: InstallmentStatus;
  daysOverdue: number;
}

// Loan balance information
export interface LoanBalanceInfo {
  loanId: string;
  totalAmount: number;
  totalPaid: number;
  totalPending: number;
  totalMora: number;
  installments: InstallmentSummary[];
}

// Overdue installment for dashboard
export interface OverdueInstallment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  balance: number;
  moraAmount: number;
  daysOverdue: number;
  status: InstallmentStatus;
  loan: {
    id: string;
    amount: number;
    remainingInstallments: number;
  };
  client: {
    id: string;
    name: string;
    phone: string;
  };
}

// Overdue summary metrics
export interface OverdueSummary {
  totalOverdue: number;
  totalMora: number;
  byDays: {
    range: string;
    count: number;
    amount: number;
  }[];
}

// Overdue API response
export interface OverdueResponse {
  installments: OverdueInstallment[];
  summary: OverdueSummary;
}

// Dashboard extended metrics (for /api/dashboard)
export interface DashboardExtendedMetrics {
  totalOverdueInstallments: number;
  totalOverdueAmount: number;
  overdueByDays: {
    range: string;
    count: number;
    amount: number;
  }[];
}