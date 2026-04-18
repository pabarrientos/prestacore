import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache para timezone
let timezoneCache: string | null = null;
let timezoneCacheTime = 0;
const CACHE_TTL = 60000; // 1 minuto

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Obtiene la zona horaria configurada del sistema
 * Default: America/Argentina/Buenos_Aires
 */
export async function getTimezone(): Promise<string> {
  const now = Date.now();
  
  // Recargar cache si expired o vacío
  if (!timezoneCache || now - timezoneCacheTime > CACHE_TTL) {
    try {
      const setting = await prisma.setting.findUnique({
        where: { key: 'TIMEZONE' },
      });
      timezoneCache = setting?.value || DEFAULT_TIMEZONE;
      timezoneCacheTime = now;
    } catch (error) {
      console.error('Error loading timezone:', error);
      timezoneCache = DEFAULT_TIMEZONE;
    }
  }
  
  return timezoneCache!;
}

/**
 * Obtiene la fecha actual en la zona horaria configurada del sistema
 */
export async function getNow(): Promise<Date> {
  const timezone = await getTimezone();
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
}

/**
 * Convierte una fecha a la zona horaria configurada del sistema
 */
export async function toTimezoneDate(date: Date | string): Promise<Date> {
  const timezone = await getTimezone();
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Date(dateObj.toLocaleString('en-US', { timeZone: timezone }));
}

/**
 * Obtiene la fecha de hoy (sin hora) en la zona horaria configurada
 */
export async function getToday(): Promise<Date> {
  const now = await getNow();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Verifica si una fecha está vencida (solo compara día, ignora hora)
 * Compara YYYY-MM-DD de ambas fechas
 */
export async function isDateBeforeToday(checkDate: Date | string): Promise<boolean> {
  const today = await getToday();
  const dateObj = typeof checkDate === 'string' ? new Date(checkDate) : checkDate;
  const checkDateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  return checkDateOnly < today;
}

/**
 * Invalidate cache (para usar después de actualizar settings)
 */
export function invalidateTimezoneCache(): void {
  timezoneCache = null;
  timezoneCacheTime = 0;
}

export default {
  getTimezone,
  getNow,
  toTimezoneDate,
  getToday,
  invalidateTimezoneCache,
};