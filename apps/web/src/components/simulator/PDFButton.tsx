'use client';

import { useState, useCallback } from 'react';
import { generateSimulatorPDF } from '@/lib/pdf/simulatorPDF';
import type { SimulationPDFData } from '@/lib/pdf/types';

interface PDFButtonProps {
  simulationData: SimulationPDFData | null;
  disabled?: boolean;
}

type ButtonState = 'default' | 'loading' | 'disabled';

export function PDFButton({ simulationData, disabled = false }: PDFButtonProps) {
  const [buttonState, setButtonState] = useState<ButtonState>(disabled ? 'disabled' : 'default');

  const handleClick = useCallback(async () => {
    if (!simulationData || buttonState === 'loading' || buttonState === 'disabled') {
      return;
    }

    setButtonState('loading');

    try {
      // Fetch ROUNDING_UNIT from settings
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      let roundingUnit = 1000;

      try {
        const response = await fetch(`${API_URL}/api/settings`);
        const data = await response.json();
        if (data.success && data.data && data.data.ROUNDING_UNIT) {
          roundingUnit = parseFloat(data.data.ROUNDING_UNIT.value) || 1000;
        }
      } catch {
        // Use default rounding unit on error
        roundingUnit = 1000;
      }

      // Generate the PDF
      generateSimulatorPDF(simulationData, roundingUnit);
      setButtonState('default');
    } catch (error) {
      console.error('Error generating PDF:', error);
      setButtonState('default');
    }
  }, [simulationData, buttonState]);

  // Determine button state
  const isDisabled = disabled || buttonState === 'disabled' || buttonState === 'loading';

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium
        transition-all duration-200 ease-in-out
        ${isDisabled
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]'
        }
      `}
      aria-label="Descargar PDF de simulación"
    >
      {buttonState === 'loading' ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Generando PDF...</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>Descargar PDF</span>
        </>
      )}
    </button>
  );
}
