import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache para no consultar la DB en cada llamada
let ratesCache: Record<string, number> | null = null;
let ratesCacheTime = 0;
const CACHE_TTL = 60000; // 1 minuto

/**
 * Obtiene una configuración de tasa por clave
 */
export async function getRate(key: string): Promise<number> {
  const now = Date.now();
  
  // Recargar cache si expired o vacío
  if (!ratesCache || now - ratesCacheTime > CACHE_TTL) {
    await reloadRatesCache();
  }
  
  return ratesCache?.[key] ?? getDefaultRate(key);
}

/**
 * Recarga el cache de tasas desde la DB
 */
async function reloadRatesCache(): Promise<void> {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['WEEKLY_BASE_RATE', 'BIWEEKLY_BASE_RATE', 'MONTHLY_BASE_RATE', 'MORA_RATE'],
        },
      },
    });
    
    ratesCache = settings.reduce((acc, s) => {
      acc[s.key] = parseFloat(s.value);
      return acc;
    }, {} as Record<string, number>);
    
    ratesCacheTime = Date.now();
  } catch (error) {
    console.error('Error loading rates:', error);
    ratesCache = {};
  }
}

/**
 * Valor por defecto si no hay configuración
 */
function getDefaultRate(key: string): number {
  const defaults: Record<string, number> = {
    WEEKLY_BASE_RATE: 0.001,      // 0.1% semanal
    BIWEEKLY_BASE_RATE: 0.002,   // 0.2% quincenal
    MONTHLY_BASE_RATE: 0.005,    // 0.5% mensual
    MORA_RATE: 0.0005,            // 0.05% diario (default)
  };
  return defaults[key] ?? 0;
}

/**
 * Invalidate cache (para usar después de actualizar settings)
 */
export function invalidateRatesCache(): void {
  ratesCache = null;
  ratesCacheTime = 0;
}

export default {
  getRate,
  invalidateRatesCache,
};
