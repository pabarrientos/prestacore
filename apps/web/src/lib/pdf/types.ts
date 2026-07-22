/**
 * PDF generation types for the loan simulator
 */

export interface SimulationPDFData {
  formData: {
    amount: number;
    term: number;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'DAILY';
  };
  result: {
    installmentAmount: number;
    totalInterest: number;
    totalPayment: number;
    amortizationSystem: 'FRENCH' | 'GERMAN' | 'FLAT_RATE';
    schedule: Array<{
      number: number;
      date: string;
      payment: number;
    }>;
  };
}

export interface PDFSummaryData {
  monto: number;
  plazo: number;
  frecuencia: string;
  frecuenciaLabel: string;
  sistemaAmortizacion: string;
  valorCuota: number;
  interesesTotales: number;
  totalAPagar: number;
}

// ============================================================
// Account Statement PDF Types
// ============================================================

export interface LoanInfoSection {
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: string;
  amortizationSystem: string;
  status: string;
  startDate: string | null;
}

export interface ClientInfoSection {
  fullName: string;
  dni: string;
  phone: string | null;
  email: string;
}

/** Raw installment data from the loan detail page */
export interface InstallmentPDFData {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  paidAmount: number;
  status: string;
}

/** Raw payment data from the loan detail page */
export interface PaymentPDFData {
  amount: number;
  status: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  installmentId?: string;
  installmentNumber?: number;
}

/** Computed installment row for the PDF table */
export interface InstallmentRow {
  installmentNumber: number;
  dueDate: string;
  cuota: number;
  principal: number;
  interest: number;
  capitalBalance: number;
  paid: number;
  saldo: number;
  mora: number;
  daysOverdue: number;
  status: string;
}

/** Main data DTO for the account statement PDF */
export interface AccountStatementPDFData {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: string;
  totalInterest: number;
  totalPayment: number;
  installmentAmount: number;
  amortizationSystem: string;
  startedAt: string | null;
  createdAt: string;
  client: { dni: string; user: { firstName: string; lastName: string; email: string; phone: string | null } };
  assignedVendor: { firstName: string; lastName: string } | null;
  installments: InstallmentPDFData[];
  payments: PaymentPDFData[];
  purpose: string | null;
}
