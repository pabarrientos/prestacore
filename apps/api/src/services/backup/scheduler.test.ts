import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseScheduleConfig, buildCronExpression } from './scheduler';

// Mock node-cron
vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  validate: vi.fn(() => true),
}));

describe('Scheduler', () => {
  describe('parseScheduleConfig', () => {
    it('should parse daily schedule correctly', () => {
      const config = {
        enabled: true,
        frequency: 'daily' as const,
        hour: 3,
      };

      const result = parseScheduleConfig(config);

      expect(result.hour).toBe(3);
      expect(result.dayOfMonth).toBeUndefined();
      expect(result.dayOfWeek).toBeUndefined();
    });

    it('should parse weekly schedule correctly', () => {
      const config = {
        enabled: true,
        frequency: 'weekly' as const,
        hour: 2,
        dayOfWeek: 1, // Monday
      };

      const result = parseScheduleConfig(config);

      expect(result.hour).toBe(2);
      expect(result.dayOfWeek).toBe(1);
      expect(result.dayOfMonth).toBeUndefined();
    });

    it('should parse monthly schedule correctly', () => {
      const config = {
        enabled: true,
        frequency: 'monthly' as const,
        hour: 1,
        dayOfMonth: 15,
      };

      const result = parseScheduleConfig(config);

      expect(result.hour).toBe(1);
      expect(result.dayOfMonth).toBe(15);
      expect(result.dayOfWeek).toBeUndefined();
    });
  });

  describe('buildCronExpression', () => {
    it('should build cron for daily schedule', () => {
      const cron = buildCronExpression({ hour: 3 });
      expect(cron).toBe('0 3 * * *'); // minute hour day month dayOfWeek
    });

    it('should build cron for weekly schedule', () => {
      const cron = buildCronExpression({ hour: 2, dayOfWeek: 1 });
      expect(cron).toBe('0 2 * * 1'); // minute hour day month dayOfWeek
    });

    it('should build cron for monthly schedule', () => {
      const cron = buildCronExpression({ hour: 1, dayOfMonth: 15 });
      expect(cron).toBe('0 1 15 * *'); // minute hour dayOfMonth month dayOfWeek
    });

    it('should handle 0 hour (midnight)', () => {
      const cron = buildCronExpression({ hour: 0 });
      expect(cron).toBe('0 0 * * *');
    });

    it('should handle 23 hour (11 PM)', () => {
      const cron = buildCronExpression({ hour: 23 });
      expect(cron).toBe('0 23 * * *');
    });
  });

  describe('invalid configurations', () => {
    it('should reject invalid hour value', () => {
      expect(() => {
        buildCronExpression({ hour: 25 });
      }).toThrow();
    });

    it('should reject invalid dayOfWeek value', () => {
      expect(() => {
        buildCronExpression({ hour: 3, dayOfWeek: 7 });
      }).toThrow();
    });

    it('should reject invalid dayOfMonth value', () => {
      expect(() => {
        buildCronExpression({ hour: 3, dayOfMonth: 32 });
      }).toThrow();
    });
  });
});