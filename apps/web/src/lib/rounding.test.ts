import { describe, it, expect } from 'vitest';
import { roundForDisplay } from './rounding';

describe('roundForDisplay', () => {
  describe('standard unit (1000)', () => {
    it('should round 12345.67 to 13000', () => {
      expect(roundForDisplay(12345.67, 1000)).toBe(13000);
    });

    it('should round 543.21 to 1000', () => {
      expect(roundForDisplay(543.21, 1000)).toBe(1000);
    });

    it('should round 1 to 1000', () => {
      expect(roundForDisplay(1, 1000)).toBe(1000);
    });

    it('should return 1000 for exactly 1000', () => {
      expect(roundForDisplay(1000, 1000)).toBe(1000);
    });

    it('should round 1500 to 2000', () => {
      expect(roundForDisplay(1500, 1000)).toBe(2000);
    });

    it('should return 0 for 0', () => {
      expect(roundForDisplay(0, 1000)).toBe(0);
    });
  });

  describe('edge cases: unit <= 0', () => {
    it('should return value unchanged when unit is 0', () => {
      expect(roundForDisplay(12345.67, 0)).toBe(12345.67);
    });

    it('should return value unchanged when unit is negative', () => {
      expect(roundForDisplay(12345.67, -500)).toBe(12345.67);
    });
  });

  describe('unit === 1', () => {
    it('should return value unchanged when unit is 1', () => {
      expect(roundForDisplay(543.21, 1)).toBe(543.21);
    });

    it('should return value unchanged for integers with unit 1', () => {
      expect(roundForDisplay(1000, 1)).toBe(1000);
    });
  });

  describe('custom unit (500)', () => {
    it('should round 1234 to 1500', () => {
      expect(roundForDisplay(1234, 500)).toBe(1500);
    });

    it('should return exact multiple unchanged', () => {
      expect(roundForDisplay(1500, 500)).toBe(1500);
    });

    it('should round 1 to 500', () => {
      expect(roundForDisplay(1, 500)).toBe(500);
    });
  });

  describe('custom unit (100)', () => {
    it('should round 543.21 to 600', () => {
      expect(roundForDisplay(543.21, 100)).toBe(600);
    });

    it('should round 99.99 to 100', () => {
      expect(roundForDisplay(99.99, 100)).toBe(100);
    });
  });

  describe('zero value', () => {
    it('should return 0 with any positive unit', () => {
      expect(roundForDisplay(0, 1000)).toBe(0);
      expect(roundForDisplay(0, 500)).toBe(0);
      expect(roundForDisplay(0, 100)).toBe(0);
    });
  });

  describe('large numbers', () => {
    it('should handle values up to millions', () => {
      expect(roundForDisplay(1234567.89, 1000)).toBe(1235000);
    });

    it('should handle large unit', () => {
      expect(roundForDisplay(5000, 5000)).toBe(5000);
    });
  });
});
