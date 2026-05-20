/**
 * Rounds a monetary value up to the nearest multiple of the given unit using ceiling math.
 * Used for consistent display rounding across the simulator screen and PDF.
 *
 * Formula: Math.ceil(value / unit) * unit
 *
 * @param value - The numeric value to round
 * @param unit - The rounding granularity (e.g., 1000 rounds to nearest thousand)
 * @returns The value rounded up to the nearest multiple of unit.
 *          Returns value unchanged when unit <= 0 or unit === 1.
 */
export function roundForDisplay(value: number, unit: number): number {
  if (unit <= 0) return value;
  if (unit === 1) return value;
  return Math.ceil(value / unit) * unit;
}
