/**
 * DateTime utilities for the frontend - date-only calculations
 * No timezone needed (all calculations use date-only)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Get today's date as YYYY-MM-DD string (local time)
 */
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Sync version: get today's date for calculation
 * Cache for 1 minute to avoid repeated calls
 */
let cachedToday: Date | null = null;
let cachedTodayTime = 0;

export function getTodayDate(): Date {
  const now = Date.now();
  if (!cachedToday || now - cachedTodayTime > 60000) {
    const str = getTodayString();
    cachedToday = new Date(str + 'T00:00:00');
    cachedTodayTime = now;
  }
  return cachedToday;
}

/**
 * Calculate days overdue using string comparison (date-only)
 */
export function calculateDaysOverdueFromStringSync(dueDate: Date | string): number {
  const today = getTodayDate();
  
  // Extract YYYY-MM-DD from the due date
  const dueDateStr = typeof dueDate === 'string' 
    ? dueDate.split('T')[0]
    : new Date(dueDate).toISOString().split('T')[0];
  
  const due = new Date(dueDateStr + 'T00:00:00');
  const diffDays = Math.floor((today.getTime() - due.getTime()) / (86400 * 1000));
  return Math.max(0, diffDays);
}

/**
 * Check if a date is in the past (date-only)
 */
export function isOverdue(dueDate: Date | string): boolean {
  return calculateDaysOverdueFromStringSync(dueDate) > 0;
}