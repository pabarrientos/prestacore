// Simple date utilities - no timezone needed (all calculations use date-only)

/**
 * Obtiene la fecha de hoy (sin hora)
 */
export async function getToday(): Promise<Date> {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Obtiene la fecha actual (sin función async)
 */
export function getNow(): Date {
  return new Date();
}

/**
 * Verifica si una fecha está vencida (solo compara día, ignora hora)
 */
export async function isDateBeforeToday(checkDate: Date | string): Promise<boolean> {
  const today = await getToday();
  const dateObj = typeof checkDate === 'string' ? new Date(checkDate) : checkDate;
  // Use UTC methods — pg driver returns naive timestamps as UTC
  const checkDateOnly = Date.UTC(
    dateObj.getUTCFullYear(),
    dateObj.getUTCMonth(),
    dateObj.getUTCDate()
  );
  const todayOnly = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  return checkDateOnly < todayOnly;
}

export default {
  getNow,
  getToday,
  isDateBeforeToday,
};