'use client';

import { useState, useCallback } from 'react';
import { generateAccountStatementPDF } from '@/lib/pdf/accountStatementPDF';
import { transformLoanData, type LoanDataForPDF } from '@/components/loans/AccountStatementButton';
import { apiFetch } from '@/lib/api';

interface BulkAccountStatementButtonProps {
  clientId: string;
  disabled?: boolean;
}

export function BulkAccountStatementButton({
  clientId,
  disabled = false,
}: BulkAccountStatementButtonProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const isDisabled = disabled || loading;

  const handleClick = useCallback(async () => {
    if (isDisabled || !clientId) return;

    setLoading(true);
    setProgress('Buscando préstamos activos...');

    try {
      // 1. Fetch active loans for this client
      const loansRes = await apiFetch(`/api/loans?clientId=${clientId}&status=ACTIVE`);
      const loansData = await loansRes.json();

      if (!loansData.success || !loansData.data?.data?.length) {
        alert('No hay préstamos activos para este cliente');
        return;
      }

      const activeLoans: { id: string }[] = loansData.data.data;

      // 2. Fetch settings once (shared across all PDFs)
      let roundingUnit = 1000;
      let moraRate = 0.0005;

      try {
        const [settingsRes, ratesRes] = await Promise.all([
          apiFetch('/api/settings'),
          apiFetch('/api/settings/rates'),
        ]);

        const settingsJson = await settingsRes.json();
        if (settingsJson.success && settingsJson.data && settingsJson.data.ROUNDING_UNIT) {
          roundingUnit = parseFloat(settingsJson.data.ROUNDING_UNIT.value) || 1000;
        }

        const ratesJson = await ratesRes.json();
        if (ratesJson.success && ratesJson.data && ratesJson.data.MORA_RATE) {
          moraRate = ratesJson.data.MORA_RATE;
        }
      } catch {
        // Fallback to seed defaults
      }

      // 3. Fetch full detail + generate PDF for each loan sequentially
      for (let i = 0; i < activeLoans.length; i++) {
        setProgress(`Descargando ${i + 1} de ${activeLoans.length}...`);

        const detailRes = await apiFetch(`/api/loans/${activeLoans[i].id}`);
        const detailData = await detailRes.json();

        if (detailData.success && detailData.data) {
          const pdfData = transformLoanData(detailData.data as LoanDataForPDF);
          generateAccountStatementPDF(pdfData, roundingUnit, moraRate);
        }

        // Small delay between downloads to avoid browser throttling
        if (i < activeLoans.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (err) {
      console.error('Error generating bulk account statements:', err);
      alert('Error al generar los resúmenes de cuenta');
    } finally {
      setLoading(false);
      setProgress('');
    }
  }, [clientId, isDisabled]);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        flex items-center justify-center gap-2 px-2 py-1 min-h-[32px] text-xs font-medium rounded
        transition-all duration-200 ease-in-out
        ${
          isDisabled
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50'
        }
      `}
      aria-label="Descargar resúmenes de cuenta de préstamos activos"
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-3 w-3"
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
          <span>{progress || 'Generando...'}</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
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
          <span>Resumen</span>
        </>
      )}
    </button>
  );
}
