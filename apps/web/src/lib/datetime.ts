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
 * Get current date in configured timezone as Date object
 * Uses the same logic as backend getNow() in services/datetime.ts
 */
export async function getNow(): Promise<Date> {
  const timezone = await getTimezone();
  const now = new Date();
  
  // Use Intl to get the current date in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  
  return new Date(
    parseInt(getPart('year')),
    parseInt(getPart('month')) - 1,
    parseInt(getPart('day')),
    parseInt(getPart('hour')),
    parseInt(getPart('minute')),
    parseInt(getPart('second'))
  );
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
 * Calculate days overdue using string comparison
 * This completely avoids timezone conversion issues with Date objects
 */
export async function getDaysOverdueFromString(dueDate: Date | string): Promise<number> {
  const todayStr = await getTodayString();
  const dueDateStr = typeof dueDate === 'string' 
    ? new Date(dueDate).toISOString().split('T')[0]  // Extract YYYY-MM-DD from ISO string
    : new Date(dueDate).toISOString().split('T')[0];
  
  const today = new Date(todayStr);
  const due = new Date(dueDateStr);
  
  const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Sync version: calculate days overdue using string dates
 * Use cached today string for performance
 */
let cachedTodayStr: string | null = null;
let cachedTodayTime = 0;

function getTodayDateOnly(): Date {
  const now = Date.now();
  if (!cachedTodayStr || now - cachedTodayTime > 60000) {
    // Get today's date in Argentina timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    cachedTodayStr = formatter.format(new Date());
    cachedTodayTime = now;
  }
  return new Date(cachedTodayStr);
}

export function calculateDaysOverdueFromStringSync(dueDate: Date | string): number {
  const today = getTodayDateOnly();
  // Extract YYYY-MM-DD from the due date string
  const dueDateStr = typeof dueDate === 'string' 
    ? dueDate.split('T')[0]
    : new Date(dueDate).toISOString().split('T')[0];
  
  const due = new Date(dueDateStr);
  const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
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
 * Calculate days overdue - replicates MoraService.calculateDaysOverdue from backend
 * Uses timezone-aware calculation with date normalization to midnight
 */
export async function getDaysOverdue(dueDate: Date | string): Promise<number> {
  const now = await getNow();
  return calculateDaysOverdueFromDates(now, dueDate);
}

/**
 * Synchronous version: calculate days overdue from two dates
 * Uses ONLY the date component (YYYY-MM-DD), ignores time completely
 * This ensures consistency between all pages and backend
 */
export function calculateDaysOverdueFromDates(now: Date, dueDate: Date | string): number {
  // Extract only date components - completely ignore time
  const nowYMD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateObj = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const dueDateYMD = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());
  
  // Calculate difference in days using date-only values
  const diffDays = Math.floor((nowYMD.getTime() - dueDateYMD.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Clear cache (for testing or timezone change)
 */
export function clearTimezoneCache(): void {
  cachedTimezone = null;
  timezoneFetchPromise = null;
}