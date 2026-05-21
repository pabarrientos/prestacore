/**
 * Payment data type consumed by mergePayments.
 * Copied from pdf/types.ts to keep this module self-contained.
 */
export interface PaymentPDFData {
  amount: number;
  status: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  installmentId?: string;
  installmentNumber?: number;
}

/**
 * Merged payment row — result of merging regular installment payments
 * with their associated "Mora cuota #N" payments on the same date.
 */
export interface MergedPaymentRow {
  date: string;
  amount: number;
  installmentNumber: number | null;
  reference: string;
  isAbonoACuenta: boolean;
}

/**
 * Parse the installment number from a "Mora cuota #X" notes string.
 * Returns the installment number or null if no match.
 */
export function parseMoraCuotaNumber(notes: string | undefined): number | null {
  if (!notes) return null;
  const match = notes.match(/Mora cuota #(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Extract a YYYY-MM-DD date key from a payment date string (for grouping by date).
 */
export function getDateKey(dateStr: string | undefined): string {
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

    const existing = mergedMap.get(mapKey);
    if (existing) {
      // Multiple regular payments for same date + cuota → accumulate amounts
      existing.amount += totalAmount;
      if ((!existing.reference || existing.reference === '-') && r.reference && r.reference !== '-') {
        existing.reference = r.reference;
      }
    } else {
      mergedMap.set(mapKey, {
        date: r.paymentDate ?? '',
        amount: totalAmount,
        installmentNumber: cuotaNum,
        reference: r.reference ?? '',
        isAbonoACuenta: false,
      });
    }
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

/**
 * Visual-only merge for the detail page payment history table.
 *
 * Rules (matching PDF behavior):
 * - "Cancelación anticipada" payments → always standalone (NOT merged by date)
 * - "Mora cancelación anticipada" payments → always standalone
 * - All other payments on the same date → merged into one row, amounts summed
 *
 * Display logic:
 * - If any merged payment has an installmentNumber, use it (shows "Cuota #N")
 * - Otherwise shows "Abono a cuenta"
 * - Reference: best available (avoids "-" and empty)
 */
export function mergePaymentsByDate(payments: PaymentPDFData[]): MergedPaymentRow[] {
  // Separate special standalone payments
  const standalone: PaymentPDFData[] = [];
  const mergeable: PaymentPDFData[] = [];

  for (const p of payments) {
    if (p.notes?.includes('Cancelación anticipada')) {
      standalone.push(p);
    } else if (p.notes?.startsWith('Mora cancelación anticipada')) {
      standalone.push(p);
    } else {
      mergeable.push(p);
    }
  }

  // Merge non-special payments by date
  const grouped = new Map<string, { total: number; installmentNumber: number | null; reference: string; date: string }>();

  for (const p of mergeable) {
    const dateKey = getDateKey(p.paymentDate);
    const existing = grouped.get(dateKey);

    if (existing) {
      existing.total += Number(p.amount);
      if (existing.installmentNumber == null && p.installmentNumber != null) {
        existing.installmentNumber = p.installmentNumber;
      }
      if ((!existing.reference || existing.reference === '-') && p.reference && p.reference !== '-') {
        existing.reference = p.reference;
      }
    } else {
      grouped.set(dateKey, {
        total: Number(p.amount),
        installmentNumber: p.installmentNumber ?? null,
        reference: p.reference || '-',
        date: p.paymentDate || '',
      });
    }
  }

  const result: MergedPaymentRow[] = Array.from(grouped.values()).map(g => ({
    date: g.date,
    amount: g.total,
    installmentNumber: g.installmentNumber,
    reference: g.reference,
    isAbonoACuenta: g.installmentNumber == null,
  }));

  // Add standalone rows (unmerged)
  for (const s of standalone) {
    const cuotaFromNotes = parseMoraCuotaNumber(s.notes);
    result.push({
      date: s.paymentDate || '',
      amount: Number(s.amount),
      installmentNumber: cuotaFromNotes, // null for cancelación, may have value for mora cuota
      reference: s.notes || s.reference || '-',
      isAbonoACuenta: cuotaFromNotes == null,
    });
  }

  // Sort: all rows by date
  result.sort((a, b) => {
    const dateA = getDateKey(a.date);
    const dateB = getDateKey(b.date);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0);
  });

  return result;
}
