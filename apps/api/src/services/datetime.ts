// Date utilities with explicit Argentina timezone (ART, UTC-3)
// Does NOT depend on system timezone — safe for Docker containers in UTC

const TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Obtiene la fecha de hoy en Argentina (sin hora, usando Date.UTC para evitar TZ del sistema)
 */
export async function getToday(): Promise<Date> {
  const now = new Date();
  // Extract date parts in ART timezone regardless of system TZ
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = fmt.format(now).split('-').map(Number);
  // Construct as UTC midnight to keep comparison timezone-agnostic
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Obtiene la fecha actual (sin función async)
 */
export function getNow(): Date {
  return new Date();
}

/**
 * Verifica si una fecha está vencida (solo compara día, ignora hora)
 * Usa UTC methods para evitar desplazamiento de timezone con fechas de la DB
 */
export async function isDateBeforeToday(checkDate: Date | string): Promise<boolean> {
  const today = await getToday();
  const dateObj = typeof checkDate === 'string' ? new Date(checkDate) : checkDate;
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