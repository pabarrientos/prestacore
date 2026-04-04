/**
 * DateTime utilities for the frontend - handles timezone from settings
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let cachedTimezone: string | null = null;
let timezoneFetchPromise: Promise<string> | null = null;

/**
 * Get timezone from settings API
 */
export async function getTimezone(): Promise<string> {
  if (cachedTimezone) {
    return cachedTimezone;
  }
  
  // If there's already a pending request, return that promise
  if (timezoneFetchPromise) {
    return timezoneFetchPromise;
  }
  
  timezoneFetchPromise = fetchTimezone();
  return timezoneFetchPromise;
}

async function fetchTimezone(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/api/settings`);
    const data = await res.json();
    if (data.success && data.data.TIMEZONE) {
      cachedTimezone = data.data.TIMEZONE.value;
      return cachedTimezone!;
    }
  } catch (error) {
    console.error('Error fetching timezone:', error);
  }
  
  // Default to Argentina timezone
  cachedTimezone = 'America/Argentina/Buenos_Aires';
  return cachedTimezone;
}

/**
 * Get current date in configured timezone as YYYY-MM-DD string
 * This avoids the toISOString() conversion issue
 */
export async function getTodayString(): Promise<string> {
  const timezone = await getTimezone();
  const now = new Date();
  
  // Format the date using the target timezone with en-CA (gives YYYY-MM-DD)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  return formatter.format(now);
}

/**
 * Get current date in configured timezone as Date object
 */
export async function getNow(): Promise<Date> {
  const today = await getTodayString();
  return new Date(today + 'T00:00:00');
}

/**
 * Check if a date (from DB) is overdue compared to the current timezone date
 */
export async function isOverdue(dueDate: Date | string): Promise<boolean> {
  const now = await getNow();
  const dueDateObj = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return dueDateObj < now;
}

/**
 * Calculate days overdue
 */
export async function getDaysOverdue(dueDate: Date | string): Promise<number> {
  const now = await getNow();
  const dueDateObj = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const diffTime = now.getTime() - dueDateObj.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Clear cache (for testing or timezone change)
 */
export function clearTimezoneCache(): void {
  cachedTimezone = null;
  timezoneFetchPromise = null;
}