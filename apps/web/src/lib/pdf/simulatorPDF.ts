/**
 * PDF generation for loan simulator - Professional Prestacore Design
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SimulationPDFData, PDFSummaryData } from './types';

// Light mode brand colors for PDF
const COLORS: Record<string, [number, number, number]> = {
  primary: [2, 132, 199],        // #0284c7 - logo-primary
  primaryLight: [14, 165, 233], // sky-500
  secondary: [107, 114, 128],    // Gray 500
  text: [17, 24, 39],            // Gray 900 - text-primary
  textLight: [107, 114, 128],    // Gray 500
  background: [255, 255, 255],   // white for light mode
  lightGray: [243, 244, 246],    // Gray 100 for summary boxes
  white: [255, 255, 255],
  border: [209, 213, 219],       // Gray 300 - border-default
};

// PNG base64 logo - replace with actual logo
const LOGO_PNG = 'data:image/png;base64,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';

/**
 * Rounds up an installment amount to the nearest rounding unit using ceiling math.
 * Formula: Math.ceil(amount / roundingUnit) * roundingUnit
 */
export function roundUpInstallment(amount: number, roundingUnit: number): number {
  if (amount <= 0) return 0;
  return Math.ceil(amount / roundingUnit) * roundingUnit;
}

/**
 * Format a date string to DD/MM/YYYY format
 */
function formatDateToDDMMYYYY(dateString: string): string {
  // Handle various date formats
  // If already in DD/MM/YYYY, return as-is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
    return dateString;
  }

  // Try parsing as ISO date or other formats
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return dateString; // Return original if can't parse
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get Spanish label for frequency
 */
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
 * Get Spanish label for amortization system
 */
function getAmortizationSystemLabel(system: string): string {
  const labels: Record<string, string> = {
    FRENCH: 'Sistema Francés',
    GERMAN: 'Sistema Alemán',
    FLAT_RATE: 'Sistema de Tasa Plana',
  };
  return labels[system] || system;
}

/**
 * Build the summary data from simulation data and rounded installment
 */
function buildSummaryData(data: SimulationPDFData, roundedInstallment: number): PDFSummaryData {
  const totalPayment = roundedInstallment * data.result.schedule.length;
  const totalInterest = totalPayment - data.formData.amount;

  return {
    monto: data.formData.amount,
    plazo: data.formData.term,
    frecuencia: data.formData.frequency,
    frecuenciaLabel: getFrequencyLabel(data.formData.frequency),
    sistemaAmortizacion: getAmortizationSystemLabel(data.result.amortizationSystem),
    valorCuota: roundedInstallment,
    interesesTotales: totalInterest,
    totalAPagar: totalPayment,
  };
}

/**
 * Draw a styled rectangle box
 */
function drawBox(doc: jsPDF, x: number, y: number, width: number, height: number, 
                 fillColor?: [number, number, number], strokeColor?: [number, number, number], strokeWidth: number = 0.5): void {
  if (fillColor) {
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
  }
  if (strokeColor) {
    doc.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2]);
    doc.setLineWidth(strokeWidth);
  }
  doc.rect(x, y, width, height, fillColor ? 'FD' : 'D');
}

/**
 * Add header with logo on left and subtitle on right - minimal clean design
 */
function addHeader(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.width;

  // Light header background
  doc.setFillColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.rect(0, 0, pageWidth, 25, 'F');

  // Bottom border line
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.5);
  doc.line(0, 25, pageWidth, 25);

  // Add logo on the LEFT (maintaining aspect ratio 560:160 = 3.5:1)
  try {
    doc.addImage(LOGO_PNG, 'PNG', 15, 5, 49, 14);
  } catch (e) {
    // Fallback: draw text if image fails
    doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PRESTACORE', 15, 16);
  }

  // Subtitle on the RIGHT - subtitle style, smaller, no company name
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Simulación de Préstamo', pageWidth - 15, 16, { align: 'right' });
}

/**
 * Add summary section with styled boxes
 */
function addSummarySection(doc: jsPDF, summary: PDFSummaryData, startY: number): number {
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;
  const boxWidth = (pageWidth - 2 * margin - 10) / 2; // Two columns with gap
  
  // Section title
  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DEL PRÉSTAMO', margin, startY + 5);
  
  // Underline
  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(1);
  doc.line(margin, startY + 7, margin + 57, startY + 7);
  
  let yPosition = startY + 18;
  
  // Row 1: Monto and Plazo
  const row1Y = yPosition;
  
  // Monto box
  drawBox(doc, margin, row1Y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('MONTO', margin + 5, row1Y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${summary.monto.toLocaleString()}`, margin + 5, row1Y + 17);
  
  // Plazo box
  const col2X = margin + boxWidth + 10;
  drawBox(doc, col2X, row1Y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PLAZO', col2X + 5, row1Y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`${summary.plazo} pagos ${summary.frecuenciaLabel}`, col2X + 5, row1Y + 17);
  
  yPosition += 30;
  
  // Row 2: Sistema and Frecuencia
  const row2Y = yPosition;
  
  // Sistema box
  drawBox(doc, margin, row2Y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SISTEMA', margin + 5, row2Y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(summary.sistemaAmortizacion, margin + 5, row2Y + 17);
  
  // Frecuencia box
  drawBox(doc, col2X, row2Y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('FRECUENCIA', col2X + 5, row2Y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(summary.frecuenciaLabel, col2X + 5, row2Y + 17);
  
  yPosition += 30;
  
  // Row 3: Valor Cuota (full width highlight)
  const row3Y = yPosition;
  const fullWidth = pageWidth - 2 * margin;
  
  drawBox(doc, margin, row3Y, fullWidth, 26, COLORS.primary, COLORS.primary);
  doc.setTextColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('VALOR DE CUOTA', margin + 5, row3Y + 10);
  doc.setTextColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${summary.valorCuota.toLocaleString()}`, margin + 5, row3Y + 21);
  
  yPosition += 34;
  
  // Row 4: Intereses Totales and Total a Pagar
  const row4Y = yPosition;
  
  // Intereses box
  drawBox(doc, margin, row4Y, boxWidth, 22, COLORS.lightGray, COLORS.border);
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('INTERESES TOTALES', margin + 5, row4Y + 8);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${summary.interesesTotales.toLocaleString()}`, margin + 5, row4Y + 17);
  
  // Total a Pagar box
  drawBox(doc, col2X, row4Y, boxWidth, 22, COLORS.primaryLight, COLORS.primary);
  doc.setTextColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL A PAGAR', col2X + 5, row4Y + 8);
  doc.setTextColor(COLORS.white[0], COLORS.white[1], COLORS.white[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${summary.totalAPagar.toLocaleString()}`, col2X + 5, row4Y + 17);
  
  yPosition += 30;
  
  return yPosition + 10;
}

/**
 * Add footer with page numbers and generation date
 */
function addFooter(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const pageCount = doc.getNumberOfPages();
  const currentPage = doc.getCurrentPageInfo().pageNumber;
  
  // Footer line
  doc.setDrawColor(COLORS.border[0], COLORS.border[1], COLORS.border[2]);
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 20, pageWidth - 20, pageHeight - 20);
  
  // Footer text
  doc.setTextColor(COLORS.textLight[0], COLORS.textLight[1], COLORS.textLight[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  doc.text(`Generado: ${dateStr}`, 20, pageHeight - 12);
  
  doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - 20, pageHeight - 12, { align: 'right' });
}

/**
 * Generate a PDF document for the loan simulation - Professional Design
 */
export function generateSimulatorPDF(data: SimulationPDFData, roundingUnit: number): void {
  // Calculate rounded installment
  const roundedInstallment = roundUpInstallment(data.result.installmentAmount, roundingUnit);

  // Build summary data with recalculated totals
  const summary = buildSummaryData(data, roundedInstallment);

  // Create PDF document
  const doc = new jsPDF();

  // === HEADER ===
  addHeader(doc);

  // === SUMMARY SECTION ===
  const summaryStartY = 38;
  addSummarySection(doc, summary, summaryStartY);

  // === AMORTIZATION TABLE ON NEW PAGE ===
  doc.addPage();

  const tableData = data.result.schedule.map((item) => [
    String(item.number),
    formatDateToDDMMYYYY(item.date),
    `$${roundUpInstallment(item.payment, roundingUnit).toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: 40, // Start after header (header ends at 25) + breathing room
    head: [['N°', 'Fecha Vencimiento', 'Valor Cuota']],
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
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 60, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    margin: { top: 5, right: 20, bottom: 35, left: 20 },
    didDrawPage: (HookData) => {
      // Re-draw header on this page (after table positioning so it doesn't overlap)
      addHeader(doc);
      // Add top padding for table content on this page
      if (HookData.cursor && HookData.cursor.y < 45) {
        HookData.cursor.y = 45;
      }
    },
    didParseCell: (HookData) => {
      // Ensure minimum row height for readability
      if (HookData.section === 'body' && HookData.row.height < 8) {
        HookData.row.height = 8;
      }
    },
  });

  // === FINAL FOOTER ON LAST PAGE ===
  addFooter(doc);

  // Save the PDF
  doc.save('simulacion-prestamo.pdf');
}
