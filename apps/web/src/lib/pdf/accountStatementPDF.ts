/**
 * PDF generation for loan account statements — Professional Prestacore Design
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { roundUpInstallment, COLORS, LOGO_PNG } from './simulatorPDF';
import { calculateDaysOverdueFromStringSync } from '../datetime';
import type {
  AccountStatementPDFData,
  InstallmentPDFData,
  PaymentPDFData,
  InstallmentRow,
  MergedPaymentRow,
} from './types';

// Status colors for row backgrounds
const STATUS_GREEN: [number, number, number] = [220, 252, 231];
const STATUS_RED: [number, number, number] = [254, 202, 202];
const STATUS_ORANGE: [number, number, number] = [254, 215, 170];
const STATUS_PURPLE: [number, number, number] = [233, 213, 255];

// ============================================================
// Pure Functions — Status Calculation & Payment Merging
// ============================================================

/**
 * Calculate dynamic installment status replicating loan detail page reduce block (lines 740-782).
 */
export function calculateInstallmentStatus(
  installment: InstallmentPDFData,
  allPayments: PaymentPDFData[],
  loanStatus: string,
  moraRate: number,
): { status: string; mora: number; daysOverdue: number } {
  const isPaidLoan = loanStatus === 'PAID';
  const isRefinanced = loanStatus === 'REFINANCIADO';

  // Calculate payments for this installment
  const paymentsForThis = allPayments.filter((p) => p.installmentId === installment.id);
  const totalPaidForInstallment = paymentsForThis.reduce((sum, p) => sum + Number(p.amount), 0);

  // Calculate days overdue using string-based date comparison (date-only)
  const daysOverdue = calculateDaysOverdueFromStringSync(installment.dueDate);
  const calculatedMora =
    daysOverdue > 0
      ? Math.round(Number(installment.balance) * moraRate * daysOverdue * 100) / 100
      : 0;

  let status: string;

  if (isPaidLoan) {
    status = 'PAID';
  } else if (totalPaidForInstallment >= Number(installment.amount)) {
    status = 'PAID';
  } else if (totalPaidForInstallment > 0) {
    status = 'PARTIAL';
  } else if (isRefinanced && installment.status === 'CANCELADA_POR_REFINANCIACION') {
    status = 'CANCELADA_POR_REFINANCIACION';
  } else {
    status = daysOverdue > 0 ? 'OVERDUE' : 'PENDING';
  }

  return { status, mora: calculatedMora, daysOverdue };
}

/**
 * Parse the installment number from a "Mora cuota #X" notes string.
 * Returns the installment number or null if no match.
 */
function parseMoraCuotaNumber(notes: string | undefined): number | null {
  if (!notes) return null;
  const match = notes.match(/Mora cuota #(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Extract a YYYY-MM-DD date key from a payment date string (for grouping by date).
 */
function getDateKey(dateStr: string | undefined): string {
  if (!dateStr) return '';
  // Extract just the date part
  const datePart = dateStr.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  // If already DD/MM/YYYY, convert to YYYY-MM-DD for grouping
  const parts = datePart.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return datePart;
}

/**
 * Merge payments where same-date + same installment number appear in both regular
 * and "Mora cuota" payments. Unmatched mora payments show as "Abono a cuenta".
 *
 * Special payment types handled as standalone (unmerged) rows:
 * - "Cancelación anticipada": notes contain "Cancelación anticipada" (not "Mora cancelación")
 * - "Mora cancelación anticipada": notes start with "Mora cancelación anticipada"
 * - Unassociated abono a cuenta: no installmentId, no special note
 */
export function mergePayments(payments: PaymentPDFData[]): MergedPaymentRow[] {
  // Separate payments into categories
  const regular: PaymentPDFData[] = [];
  const mora: PaymentPDFData[] = [];
  const cancelacionAnticipada: PaymentPDFData[] = [];
  const moraCancelacionAnticipada: PaymentPDFData[] = [];
  const abonoACuenta: PaymentPDFData[] = [];

  for (const p of payments) {
    const cuotaFromNotes = parseMoraCuotaNumber(p.notes);
    if (cuotaFromNotes !== null) {
      mora.push(p);
    } else if (p.notes?.startsWith('Mora cancelación anticipada')) {
      moraCancelacionAnticipada.push(p);
    } else if (p.notes?.includes('Cancelación anticipada')) {
      cancelacionAnticipada.push(p);
    } else if (p.installmentId == null) {
      // Unassociated payment with no recognizable note pattern
      abonoACuenta.push(p);
    } else {
      regular.push(p);
    }
  }

  // Build merged result
  const mergedMap = new Map<string, MergedPaymentRow>();
  // Track which mora payments have been consumed
  const consumedMora = new Set<number>();
  const moraIndexed = mora.map((p, idx) => ({ payment: p, idx }));

  // Process regular payments first (with installment association)
  for (const r of regular) {
    const dateKey = getDateKey(r.paymentDate);
    const cuotaNum = r.installmentNumber ?? null;
    const mapKey = `${dateKey}::${cuotaNum ?? 'none'}::regular`;

    let totalAmount = Number(r.amount);

    // Find all matching mora payments
    for (const m of moraIndexed) {
      if (consumedMora.has(m.idx)) continue;
      const moraNum = parseMoraCuotaNumber(m.payment.notes);
      if (moraNum === cuotaNum && getDateKey(m.payment.paymentDate) === dateKey) {
        consumedMora.add(m.idx);
        totalAmount += Number(m.payment.amount);
      }
    }

    mergedMap.set(mapKey, {
      date: r.paymentDate ?? '',
      amount: totalAmount,
      installmentNumber: cuotaNum,
      reference: r.reference ?? '',
      isAbonoACuenta: false,
    });
  }

  // Process remaining mora payments (unmatched)
  for (const m of moraIndexed) {
    if (consumedMora.has(m.idx)) continue;
    const dateKey = getDateKey(m.payment.paymentDate);
    const cuotaNum = parseMoraCuotaNumber(m.payment.notes);
    const mapKey = `${dateKey}::${cuotaNum ?? 'none'}::mora::${m.idx}`;

    mergedMap.set(mapKey, {
      date: m.payment.paymentDate ?? '',
      amount: Number(m.payment.amount),
      installmentNumber: cuotaNum,
      reference: 'Abono a cuenta',
      isAbonoACuenta: true,
    });
  }

  // Unique counter to avoid map-key collisions for standalone rows on same date
  let uniqueCounter = 0;

  // Process cancelación anticipada payments (standalone, unmerged)
  for (const ca of cancelacionAnticipada) {
    const dateKey = getDateKey(ca.paymentDate);
    const mapKey = `${dateKey}::none::cancelacion::${uniqueCounter++}`;
    const reference = ca.notes || ca.reference || 'Cancelación anticipada';

    mergedMap.set(mapKey, {
      date: ca.paymentDate ?? '',
      amount: Number(ca.amount),
      installmentNumber: null,
      reference,
      isAbonoACuenta: true,
    });
  }

  // Process mora cancelación anticipada payments (standalone, unmerged)
  for (const mca of moraCancelacionAnticipada) {
    const dateKey = getDateKey(mca.paymentDate);
    const mapKey = `${dateKey}::none::moraCancelacion::${uniqueCounter++}`;
    const reference = mca.notes || mca.reference || 'Mora cancelación anticipada';

    mergedMap.set(mapKey, {
      date: mca.paymentDate ?? '',
      amount: Number(mca.amount),
      installmentNumber: null,
      reference,
      isAbonoACuenta: true,
    });
  }

  // Process other abono a cuenta payments (standalone, unmerged)
  for (const aa of abonoACuenta) {
    const dateKey = getDateKey(aa.paymentDate);
    const mapKey = `${dateKey}::none::abono::${uniqueCounter++}`;

    mergedMap.set(mapKey, {
      date: aa.paymentDate ?? '',
      amount: Number(aa.amount),
      installmentNumber: null,
      reference: 'Abono a cuenta',
      isAbonoACuenta: true,
    });
  }

  // Sort by date ascending, then by installment number
  const result = Array.from(mergedMap.values());
  result.sort((a, b) => {
    const dateA = getDateKey(a.date);
    const dateB = getDateKey(b.date);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0);
  });

  return result;
}

// ============================================================
// Helpers — Formatting & Rendering
// ============================================================

/**
 * Calculate total mora paid across all installments.
 * For each installment: total paid (from merged payments) minus cuota amount.
 * If positive, the difference is mora paid.
 * Also includes "Mora cancelación anticipada" payments that are not associated
 * with any installment. Sum and round.
 */
export function calculateMoraPagada(
  installments: InstallmentPDFData[],
  mergedPayments: MergedPaymentRow[],
  roundingUnit: number,
): number {
  let total = 0;

  for (const inst of installments) {
    const totalPaidForThis = mergedPayments
      .filter((p) => p.installmentNumber === inst.installmentNumber)
      .reduce((sum, p) => sum + p.amount, 0);

    // Round BOTH values with roundUpInstallment before subtraction,
    // consistent with how they appear in the PDF tables.
    // This ensures mora pagada = displayedPayment - displayedCuota,
    // not rawDBPayment - rawDBCuota which can differ by up to ROUNDING_UNIT-1.
    const roundedTotalPaid = roundUpInstallment(totalPaidForThis, roundingUnit);
    const roundedCuota = roundUpInstallment(inst.amount, roundingUnit);

    const excess = roundedTotalPaid - roundedCuota;
    if (excess > 0) {
      total += excess;
    }
  }

  // Add "Mora cancelación anticipada" payments — these are abono-a-cuenta
  // payments specifically labeled as mora and contribute to mora pagada.
  const moraCancelacionTotal = mergedPayments
    .filter((p) => p.reference?.startsWith('Mora cancelación anticipada'))
    .reduce((sum, p) => sum + p.amount, 0);

  total += roundUpInstallment(moraCancelacionTotal, roundingUnit);

  // Round the final sum for consistency (edge case: if individual excesses
  // happen to not be multiples of roundingUnit after rounding both operands,
  // which shouldn't occur but provides a safety net).
  return roundUpInstallment(total, roundingUnit);
}

/**
 * Calculate the total accumulated mora for the financial summary.
 * Only counts installments that display mora in the table (OVERDUE and PARTIAL).
 * Applies roundUpInstallment to EACH mora before summing, so the total
 * equals the sum of the visible mora values in the installments table.
 */
export function calculateMoraAcumulada(
  rows: InstallmentRow[],
  roundingUnit: number,
): number {
  return rows
    .filter((r) => r.status === 'OVERDUE' || r.status === 'PARTIAL')
    .reduce((sum, r) => sum + roundUpInstallment(r.mora, roundingUnit), 0);
}

function formatDateToDDMMYYYY(dateString: string): string {
  if (!dateString) return '-';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
  const datePart = dateString.split('T')[0];
  const [year, month, day] = datePart.split('-');
  if (year && month && day) return `${day}/${month}/${year}`;
  return dateString;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('es-AR')}`;
}

function drawBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor?: [number, number, number],
  strokeColor?: [number, number, number],
  strokeWidth = 0.5,
): void {
  if (fillColor) {
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
  }
  if (strokeColor) {
    doc.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2]);
    doc.setLineWidth(strokeWidth);
  }
  doc.rect(x, y, width, height, fillColor ? 'FD' : 'D');
}

function getFrequencyLabel(frequency: string): string {
  const labels: Record<string, string> = {
    WEEKLY: 'semanal',
    BIWEEKLY: 'quincenal',
    MONTHLY: 'mensual',
    DAILY: 'diario',
  };
  return labels[frequency] || frequency.toLowerCase();
}

/**
 * Calculate the per-period interest rate from the annual rate.
 */
export function getPeriodRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'WEEKLY':
      return Math.round((annualRate / 48) * 10000) / 10000;
    case 'BIWEEKLY':
      return Math.round((annualRate / 24) * 10000) / 10000;
    case 'DAILY':
      return Math.round((annualRate / 360) * 10000) / 10000;
    default:
      return Math.round((annualRate / 12) * 10000) / 10000;
  }
}

function getAmortizationSystemLabel(system: string): string {
  const labels: Record<string, string> = {
    FRENCH: 'Sistema Francés',
    GERMAN: 'Sistema Alemán',
    FLAT_RATE: 'Sistema de Tasa Plana',
  };
  return labels[system] || system;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Pendiente',
    PAID: 'Pagado',
    OVERDUE: 'Vencido',
    PARTIAL: 'Parcial',
    CANCELADA_POR_REFINANCIACION: 'Refinanciada',
    ACTIVE: 'Activo',
    DEFAULTED: 'En Mora',
  };
  return labels[status] || status;
}

function getStatusColor(status: string): [number, number, number] | null {
  switch (status) {
    case 'PAID':
      return STATUS_GREEN;
    case 'OVERDUE':
      return STATUS_RED;
    case 'PARTIAL':
      return STATUS_ORANGE;
    case 'CANCELADA_POR_REFINANCIACION':
      return STATUS_PURPLE;
    default:
      return null;
  }
}

// ============================================================
// PDF Sections
// ============================================================

function addHeader(doc: jsPDF, loanId: string): void {
  const pageWidth = doc.internal.pageSize.width;

  doc.setFillColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.5);
  doc.line(0, 25, pageWidth, 25);

  try {
    doc.addImage(LOGO_PNG, 'PNG', 15, 5, 49, 14);
  } catch (_e) {
    doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PRESTACORE', 15, 16);
  }

  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Resumen de Cuenta — Préstamo #${loanId}`, pageWidth - 15, 16, { align: 'right' });
}

function addLoanInfoSection(doc: jsPDF, data: AccountStatementPDFData, startY: number): number {
  const margin = 20;
  const pageWidth = doc.internal.pageSize.width;
  const boxWidth = (pageWidth - 2 * margin - 10) / 2;

  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL PRÉSTAMO', margin, startY + 5);

  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(1);
  doc.line(margin, startY + 7, margin + 55, startY + 7);

  let y = startY + 18;

  // Row 1: Monto | Tasa
  drawBox(doc, margin, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('MONTO', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(data.amount), margin + 5, y + 17);

  const col2 = margin + boxWidth + 10;
  drawBox(doc, col2, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TASA', col2 + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const periodRate = getPeriodRate(data.interestRate, data.frequency);
  doc.text(`${periodRate.toFixed(2)}% ${getFrequencyLabel(data.frequency)}`, col2 + 5, y + 17);

  y += 30;

  // Row 2: Plazo | Frecuencia
  drawBox(doc, margin, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PLAZO', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.termMonths} pagos ${getFrequencyLabel(data.frequency)}`, margin + 5, y + 17);

  drawBox(doc, col2, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('FRECUENCIA', col2 + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(getFrequencyLabel(data.frequency), col2 + 5, y + 17);

  y += 30;

  // Row 3: Sistema | Estado
  drawBox(doc, margin, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SISTEMA', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(getAmortizationSystemLabel(data.amortizationSystem), margin + 5, y + 17);

  drawBox(doc, col2, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('ESTADO', col2 + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(getStatusLabel(data.status), col2 + 5, y + 17);

  y += 30;

  // Row 4: Fecha inicio (full width)
  const fullWidth = pageWidth - 2 * margin;
  drawBox(doc, margin, y, fullWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('FECHA INICIO', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(
    data.startedAt ? formatDateToDDMMYYYY(data.startedAt) : '-',
    margin + 5,
    y + 17,
  );

  y += 30;

  return y + 10;
}

function addClientInfoSection(doc: jsPDF, data: AccountStatementPDFData, startY: number): number {
  const margin = 20;
  const pageWidth = doc.internal.pageSize.width;
  const boxWidth = (pageWidth - 2 * margin - 10) / 2;

  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL CLIENTE', margin, startY + 5);

  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(1);
  doc.line(margin, startY + 7, margin + 54, startY + 7);

  let y = startY + 18;
  const col2 = margin + boxWidth + 10;

  // Row 1: Nombre | DNI
  const fullName = `${data.client.user.firstName} ${data.client.user.lastName}`;
  drawBox(doc, margin, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('NOMBRE', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(fullName, margin + 5, y + 17);

  drawBox(doc, col2, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('DNI', col2 + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(data.client.dni, col2 + 5, y + 17);

  y += 30;

  // Row 2: Teléfono | Email
  drawBox(doc, margin, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TELÉFONO', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.client.user.phone ?? '-', margin + 5, y + 17);

  drawBox(doc, col2, y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('EMAIL', col2 + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.client.user.email, col2 + 5, y + 17);

  y += 30;

  return y + 10;
}

function addFinancialSummary(
  doc: jsPDF,
  data: AccountStatementPDFData,
  rows: InstallmentRow[],
  mergedPayments: MergedPaymentRow[],
  startY: number,
  roundingUnit: number,
): number {
  const margin = 20;
  const pageWidth = doc.internal.pageSize.width;

  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN FINANCIERO', margin, startY + 5);

  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(1);
  doc.line(margin, startY + 7, margin + 56, startY + 7);

  let y = startY + 18;

  const totalPaid = mergedPayments.reduce((sum, p) => sum + roundUpInstallment(p.amount, roundingUnit), 0);
  const saldoPendiente = rows.reduce((sum, r) => sum + roundUpInstallment(r.saldo, roundingUnit), 0);
  const moraAcumulada = calculateMoraAcumulada(rows, roundingUnit);
  const moraPagada = calculateMoraPagada(data.installments, mergedPayments, roundingUnit);

  // 2×2 grid layout: Total pagado | Saldo pendiente
  //                    Mora acum. actual | Mora pagada
  const gap = 7;
  const boxW = (pageWidth - 2 * margin - gap) / 2;
  const col2 = margin + boxW + gap;

  // Row 1: Total pagado | Saldo pendiente
  drawBox(doc, margin, y, boxW, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL PAGADO', margin + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(totalPaid), margin + 5, y + 17);

  drawBox(doc, col2, y, boxW, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SALDO PENDIENTE', col2 + 5, y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(saldoPendiente), col2 + 5, y + 17);

  y += 30;

  // Row 2: Mora acum. actual | Mora pagada
  drawBox(doc, margin, y, boxW, 22, COLORS.primaryLight, COLORS.primary);
  doc.setTextColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('MORA ACUM. ACTUAL', margin + 5, y + 8);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(moraAcumulada), margin + 5, y + 19);

  drawBox(doc, col2, y, boxW, 22, COLORS.primaryLight, COLORS.primary);
  doc.setTextColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('MORA PAGADA', col2 + 5, y + 8);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(moraPagada), col2 + 5, y + 19);

  y += 30;

  return y + 10;
}

function addInstallmentsTable(
  doc: jsPDF,
  rows: InstallmentRow[],
  roundingUnit: number,
  startY: number,
): void {
  const margin = 20;

  // Section header — "PLAN DE PAGOS"
  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('PLAN DE PAGOS', margin, startY + 5);

  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(1);
  doc.line(margin, startY + 7, margin + 52, startY + 7);

  const tableData = rows.map((r) => [
    String(r.installmentNumber),
    formatDateToDDMMYYYY(r.dueDate),
    formatCurrency(roundUpInstallment(r.cuota, roundingUnit)),
    formatCurrency(roundUpInstallment(r.saldo, roundingUnit)),
    (r.status === 'PARTIAL' || r.status === 'OVERDUE')
      ? formatCurrency(roundUpInstallment(r.mora, roundingUnit))
      : '-',
    (r.status === 'PARTIAL' || r.status === 'OVERDUE')
      ? String(r.daysOverdue)
      : '-',
    getStatusLabel(r.status),
  ]);

  const tableStartY = startY + 18;

  autoTable(doc, {
    startY: tableStartY,
    head: [['N°', 'Fecha Venc.', 'Cuota', 'Saldo', 'Mora', 'Días Venc.', 'Estado']],
    body: tableData,
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: COLORS.text,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 28, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    margin: { top: 35, right: 20, bottom: 35, left: 20 },
    didDrawPage: () => {
      // Re-draw page header on overflow pages
      // margin.top: 35 ensures table content starts below the header area (0-25mm)
      addHeader(doc, '');
    },
    didParseCell: (HookData) => {
      if (HookData.section === 'body') {
        const rowData = rows[HookData.row.index];
        if (rowData) {
          const color = getStatusColor(rowData.status);
          if (color) {
            HookData.cell.styles.fillColor = color;
          }
        }
        if (HookData.row.height < 8) {
          HookData.row.height = 8;
        }
      }
    },
  });
}

function addPaymentsTable(doc: jsPDF, mergedPayments: MergedPaymentRow[], roundingUnit: number): void {
  const docAny = doc as unknown as Record<string, unknown>;
  const lastY = (docAny.lastAutoTable as { finalY: number } | undefined)?.finalY ?? 40;
  const margin = 20;

  if (mergedPayments.length === 0) {
    // Section header even when no payments
    doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTORIAL DE PAGOS', margin, lastY + 15);

    doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
    doc.setLineWidth(1);
    doc.line(margin, lastY + 17, margin + 55, lastY + 17);
    // "Sin pagos registrados" message
    doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'italic');
    doc.text('Sin pagos registrados', margin, lastY + 30);
    return;
  }

  // Section header — "HISTORIAL DE PAGOS"
  const headerY = lastY + 15;
  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('HISTORIAL DE PAGOS', margin, headerY + 5);

  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(1);
  doc.line(margin, headerY + 7, margin + 55, headerY + 7);

  const tableData = mergedPayments.map((p) => [
    formatDateToDDMMYYYY(p.date),
    formatCurrency(roundUpInstallment(p.amount, roundingUnit)),
    p.installmentNumber != null ? `#${p.installmentNumber}` : '-',
    p.reference,
  ]);

  autoTable(doc, {
    startY: headerY + 18,
    head: [['Fecha Pago', 'Monto', 'Cuota', 'Referencia']],
    body: tableData,
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: COLORS.text,
    },
    columnStyles: {
      0: { cellWidth: 35, halign: 'center' },
      1: { cellWidth: 40, halign: 'right' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 70, halign: 'left' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    margin: { top: 35, right: 20, bottom: 35, left: 20 },
    didDrawPage: () => {
      // Re-draw page header on overflow pages
      // margin.top: 35 ensures table content starts below the header area (0-25mm)
      addHeader(doc, '');
    },
  });
}

function addFooter(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const pageCount = doc.getNumberOfPages();

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
    doc.setLineWidth(0.5);
    doc.line(20, pageHeight - 20, pageWidth - 20, pageHeight - 20);

    doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    doc.text(`Generado: ${dateStr} ${timeStr}`, 20, pageHeight - 12);

    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 20, pageHeight - 12, { align: 'right' });
  }
}

// ============================================================
// Main Generator
// ============================================================

export function generateAccountStatementPDF(data: AccountStatementPDFData, roundingUnit: number, moraRate: number): void {

  // 1. Compute installment status
  const computedInstallments: InstallmentRow[] = data.installments.map((inst) => {
    const result = calculateInstallmentStatus(inst, data.payments, data.status, moraRate);

    // Total paid for this installment
    const paymentsForThis = data.payments.filter(p => p.installmentId === inst.id);
    const totalPaid = paymentsForThis.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate,
      cuota: inst.amount,
      paid: totalPaid,
      saldo: Number(inst.balance),
      mora: result.mora,
      daysOverdue: result.daysOverdue,
      status: result.status,
    };
  });

  // 2. Merge payments
  const mergedPayments = mergePayments(data.payments);

  // 3. Create PDF document
  const doc = new jsPDF();

  // Header
  addHeader(doc, data.id);

  // Client info section (rendered BEFORE loan info per spec ordering)
  let y = 38;
  y = addClientInfoSection(doc, data, y);

  // Loan info section
  y = addLoanInfoSection(doc, data, y);

  // === PAGE BREAK before financial summary ===
  // Ensures financial summary, installments table, and payments table
  // all start fresh with consistent top margins on a new page.
  doc.addPage();

  // Re-draw header on new page
  addHeader(doc, data.id);

  // Financial summary
  y = addFinancialSummary(doc, data, computedInstallments, mergedPayments, 38, roundingUnit);

  // Installments table — Y position flows from financial summary
  addInstallmentsTable(doc, computedInstallments, roundingUnit, y);

  // Payments table
  addPaymentsTable(doc, mergedPayments, roundingUnit);

  // Footer on every page (iterates all pages and draws footer on each)
  addFooter(doc);

  // Save
  doc.save(`resumen-cuenta-${data.id}.pdf`);
}
