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
  const checkDateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  return checkDateOnly < today;
}

export default {
  getNow,
  getToday,
  isDateBeforeToday,
};