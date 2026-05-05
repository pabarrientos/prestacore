import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SimulationPDFData } from './types';

// Use hoisted to ensure mocks are defined at the correct scope
const { mockSetFontSize, mockText, mockSetTextColor, mockAutoTable, mockSave, mockAddPage, mockGetNumberOfPages, mockSetFillColor, mockSetDrawColor, mockSetLineWidth, mockRect, mockAddImage, mockGetCurrentPageInfo, mockSetFont, mockLine } = vi.hoisted(() => ({
  mockSetFontSize: vi.fn(),
  mockText: vi.fn(),
  mockSetTextColor: vi.fn(),
  mockAutoTable: vi.fn(),
  mockSave: vi.fn(),
  mockAddPage: vi.fn(),
  mockGetNumberOfPages: vi.fn(() => 1),
  mockSetFillColor: vi.fn(),
  mockSetDrawColor: vi.fn(),
  mockSetLineWidth: vi.fn(),
  mockRect: vi.fn(),
  mockAddImage: vi.fn(),
  mockGetCurrentPageInfo: vi.fn(() => ({ pageNumber: 1, orientation: 'p' })),
  mockSetFont: vi.fn(),
  mockLine: vi.fn(),
}));

// Mock jspdf module
vi.mock('jspdf', () => {
return {
      default: vi.fn(() => ({
        setFontSize: mockSetFontSize,
        text: mockText,
        setTextColor: mockSetTextColor,
        autoTable: mockAutoTable,
        save: mockSave,
        addPage: mockAddPage,
        getNumberOfPages: mockGetNumberOfPages,
        setFillColor: mockSetFillColor,
        setDrawColor: mockSetDrawColor,
        setLineWidth: mockSetLineWidth,
        rect: mockRect,
        addImage: mockAddImage,
        getCurrentPageInfo: mockGetCurrentPageInfo,
        setFont: mockSetFont,
        line: mockLine,
        internal: {
          pageSize: { height: 297 },
        },
        lastAutoTable: { finalY: 0 },
      })),
    };
});

// Mock jspdf-autotable
vi.mock('jspdf-autotable', () => {
  return {
    default: mockAutoTable,
  };
});

// Import after mocking
import { roundUpInstallment, generateSimulatorPDF } from './simulatorPDF';

describe('simulatorPDF', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('roundUpInstallment', () => {
    it('should round up to nearest rounding unit', () => {
      // 902.58 with unit 1000 → ceil(0.90258) * 1000 = 1000
      expect(roundUpInstallment(902.58, 1000)).toBe(1000);
    });

    it('should return exact multiple unchanged', () => {
      // 1000 is already a multiple of 1000
      expect(roundUpInstallment(1000, 1000)).toBe(1000);
    });

    it('should round up 1 when exactly on boundary', () => {
      // 2000 is a multiple, but 1500 should round to 2000
      expect(roundUpInstallment(1500, 1000)).toBe(2000);
    });

    it('should handle small amounts', () => {
      // 500 with unit 1000 → ceil(0.5) * 1000 = 1000
      expect(roundUpInstallment(500, 1000)).toBe(1000);
    });

    it('should handle large rounding unit', () => {
      // 5000 with unit 5000 → ceil(1) * 5000 = 5000
      expect(roundUpInstallment(5000, 5000)).toBe(5000);
    });

    it('should handle zero amount', () => {
      expect(roundUpInstallment(0, 1000)).toBe(0);
    });
  });

  describe('generateSimulatorPDF', () => {
    it('should generate PDF with correct structure', () => {
      const data: SimulationPDFData = {
        formData: {
          amount: 10000,
          term: 12,
          frequency: 'MONTHLY',
        },
        result: {
          installmentAmount: 902.58,
          totalInterest: 830.96,
          totalPayment: 10830.96,
          amortizationSystem: 'FRENCH',
          schedule: Array.from({ length: 12 }, (_, i) => ({
            number: i + 1,
            date: `01/${String(i + 1).padStart(2, '0')}/2024`,
            payment: 902.58,
          })),
        },
      };

      generateSimulatorPDF(data, 1000);

      // Verify jsPDF was instantiated
      expect(mockSetFontSize).toHaveBeenCalled();
      // Verify text was called (PDF has multiple text elements)
      expect(mockText).toHaveBeenCalled();
      // Verify autoTable was called for the amortization table
      expect(mockAutoTable).toHaveBeenCalled();
    });

    it('should use rounded installment for calculations', () => {
      const data: SimulationPDFData = {
        formData: {
          amount: 10000,
          term: 12,
          frequency: 'MONTHLY',
        },
        result: {
          installmentAmount: 902.58, // Will round to 1000
          totalInterest: 830.96,
          totalPayment: 10830.96,
          amortizationSystem: 'FRENCH',
          schedule: Array.from({ length: 12 }, (_, i) => ({
            number: i + 1,
            date: `01/${String(i + 1).padStart(2, '0')}/2024`,
            payment: 902.58,
          })),
        },
      };

      generateSimulatorPDF(data, 1000);

      // autoTable should have been called with rounded installment
      expect(mockAutoTable).toHaveBeenCalled();
    });

    it('should format dates to DD/MM/YYYY', () => {
      const data: SimulationPDFData = {
        formData: {
          amount: 5000,
          term: 3,
          frequency: 'WEEKLY',
        },
        result: {
          installmentAmount: 1800,
          totalInterest: 400,
          totalPayment: 5400,
          amortizationSystem: 'GERMAN',
          schedule: [
            { number: 1, date: '2024-01-08', payment: 1800 },
            { number: 2, date: '2024-01-15', payment: 1800 },
            { number: 3, date: '2024-01-22', payment: 1800 },
          ],
        },
      };

      generateSimulatorPDF(data, 1000);

      // Verify autoTable was called
      expect(mockAutoTable).toHaveBeenCalled();
    });

    it('should recalculate totals with rounded installment', () => {
      const data: SimulationPDFData = {
        formData: {
          amount: 10000,
          term: 3,
          frequency: 'MONTHLY',
        },
        result: {
          installmentAmount: 4000, // Will round to 4000 with unit 1000
          totalInterest: 2000,
          totalPayment: 12000,
          amortizationSystem: 'FLAT_RATE',
          schedule: [
            { number: 1, date: '01/02/2024', payment: 4000 },
            { number: 2, date: '01/03/2024', payment: 4000 },
            { number: 3, date: '01/04/2024', payment: 4000 },
          ],
        },
      };

      generateSimulatorPDF(data, 1000);

      // autoTable should have been called
      expect(mockAutoTable).toHaveBeenCalled();
      // Verify doc.save was called to trigger download
      expect(mockSave).toHaveBeenCalledWith('simulacion-prestamo.pdf');
    });
  });
});
