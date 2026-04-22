import { PrismaClient } from '@prisma/client';
import { AmortizationSystemType } from './amortization';

const prisma = new PrismaClient();

// Re-export the enum from local amortization service
export { AmortizationSystemType } from './amortization';

const VALID_SYSTEMS = new Set(['FRENCH', 'GERMAN', 'FLAT_RATE']);
const DEFAULT_SYSTEM: AmortizationSystemType = AmortizationSystemType.FRENCH;
const SYSTEM_KEY = 'defaultAmortizationSystem';

/**
 * Get the default amortization system from settings.
 * Falls back to FRENCH if not configured.
 */
export async function getDefaultAmortizationSystem(): Promise<AmortizationSystemType> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SYSTEM_KEY },
    });
    if (setting && VALID_SYSTEMS.has(setting.value)) {
      return setting.value as AmortizationSystemType;
    }
    return DEFAULT_SYSTEM;
  } catch (error) {
    console.error('Error getting default amortization system:', error);
    return DEFAULT_SYSTEM;
  }
}

/**
 * Set the default amortization system in settings.
 * Throws if value is not a valid enum value.
 */
export async function setDefaultAmortizationSystem(system: AmortizationSystemType): Promise<void> {
  if (!VALID_SYSTEMS.has(system)) {
    throw new Error(`Invalid amortization system: ${system}. Must be one of: FRENCH, GERMAN, FLAT_RATE`);
  }
  await prisma.setting.upsert({
    where: { key: SYSTEM_KEY },
    update: { value: system },
    create: { key: SYSTEM_KEY, value: system, description: 'Sistema de amortización por defecto para nuevos préstamos' },
  });
}

/**
 * Seed default amortization system if not present.
 * Called on app startup.
 */
export async function seedDefaultAmortizationSystem(): Promise<void> {
  const existing = await prisma.setting.findUnique({
    where: { key: SYSTEM_KEY },
  });
  if (!existing) {
    await prisma.setting.create({
      data: {
        key: SYSTEM_KEY,
        value: DEFAULT_SYSTEM,
        description: 'Sistema de amortización por defecto para nuevos préstamos',
      },
    });
    console.log(`[Settings] Seeded default amortization system: ${DEFAULT_SYSTEM}`);
  }
}

// ============================================
// Rate Settings
// ============================================

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
          in: ['WEEKLY_BASE_RATE', 'BIWEEKLY_BASE_RATE', 'MONTHLY_BASE_RATE', 'DAILY_BASE_RATE', 'MORA_RATE'],
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
    DAILY_BASE_RATE: 0.005,      // 0.5% diario
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

/**
 * Obtiene la unidad de redondeo configurada
 */
export async function getRoundingUnit(): Promise<number> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'ROUNDING_UNIT' },
    });
    return setting ? parseInt(setting.value, 10) : 1000;
  } catch (error) {
    console.error('Error getting rounding unit:', error);
    return 1000;
  }
}

export default {
  getRate,
  getRoundingUnit,
  invalidateRatesCache,
  getDefaultAmortizationSystem,
  setDefaultAmortizationSystem,
  seedDefaultAmortizationSystem,
};
