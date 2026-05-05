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
