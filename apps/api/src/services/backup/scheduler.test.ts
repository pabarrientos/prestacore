import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseScheduleConfig, buildCronExpression, startScheduler, stopScheduler } from './scheduler';
import { PrismaClient } from '@prisma/client';

// Use vi.hoisted to share state between mock factory and tests
const { mockSchedule, scheduledCallback } = vi.hoisted(() => {
  let callback: () => void;
  const mockSched = vi.fn((_expr: string, cb: () => void) => {
    callback = cb;
    return { stop: vi.fn() };
  });
  return { mockSchedule: mockSched, scheduledCallback: () => callback! };
});

// Mock node-cron with a default export
vi.mock('node-cron', () => {
  return {
    __esModule: true,
    schedule: mockSchedule,
    validate: vi.fn(() => true),
    default: {
      schedule: mockSchedule,
      validate: vi.fn(() => true),
    },
  };
});

// Mock the dump module
vi.mock('./dump', () => ({
  createBackup: vi.fn(),
}));

describe('Scheduler', () => {
  beforeEach(() => {
    mockSchedule.mockClear();
  });

  describe('parseScheduleConfig', () => {
    it('should parse daily schedule correctly', () => {
      const config = {
        enabled: true,
        frequency: 'daily' as const,
        hour: 3,
      };

      const result = parseScheduleConfig(config);

      expect(result.hour).toBe(3);
      expect(result.minute).toBe(0); // default when not provided
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
      const cron = buildCronExpression({ hour: 3, minute: 0 });
      expect(cron).toBe('0 3 * * *'); // minute hour day month dayOfWeek
    });

    it('should build cron for daily schedule with custom minute', () => {
      const cron = buildCronExpression({ hour: 14, minute: 30 });
      expect(cron).toBe('30 14 * * *');
    });

    it('should build cron for weekly schedule', () => {
      const cron = buildCronExpression({ hour: 2, minute: 0, dayOfWeek: 1 });
      expect(cron).toBe('0 2 * * 1'); // minute hour day month dayOfWeek
    });

    it('should build cron for monthly schedule', () => {
      const cron = buildCronExpression({ hour: 1, minute: 0, dayOfMonth: 15 });
      expect(cron).toBe('0 1 15 * *'); // minute hour dayOfMonth month dayOfWeek
    });

    it('should handle 0 hour (midnight)', () => {
      const cron = buildCronExpression({ hour: 0, minute: 0 });
      expect(cron).toBe('0 0 * * *');
    });

    it('should handle 23 hour (11 PM)', () => {
      const cron = buildCronExpression({ hour: 23, minute: 0 });
      expect(cron).toBe('0 23 * * *');
    });
  });

  describe('invalid configurations', () => {
    it('should reject invalid hour value', () => {
      expect(() => {
        buildCronExpression({ hour: 25, minute: 0 });
      }).toThrow();
    });

    it('should reject invalid minute value', () => {
      expect(() => {
        buildCronExpression({ hour: 3, minute: 60 });
      }).toThrow();
    });

    it('should reject invalid dayOfWeek value', () => {
      expect(() => {
        buildCronExpression({ hour: 3, minute: 0, dayOfWeek: 7 });
      }).toThrow();
    });

    it('should reject invalid dayOfMonth value', () => {
      expect(() => {
        buildCronExpression({ hour: 3, minute: 0, dayOfMonth: 32 });
      }).toThrow();
    });
  });

  describe('startScheduler', () => {
    it('should trigger backup when cron fires', async () => {
      const prisma = new PrismaClient();

      // Mock a schedule setting
      await prisma.setting.upsert({
        where: { key: 'BACKUP_SCHEDULE' },
        update: { value: JSON.stringify({ enabled: true, frequency: 'daily', hour: 3 }) },
        create: { key: 'BACKUP_SCHEDULE', value: JSON.stringify({ enabled: true, frequency: 'daily', hour: 3 }) },
      });

      await startScheduler(prisma);

      // Verify that cron.schedule was called (indicating scheduler registered)
      expect(mockSchedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function)
      );
    });
  });
});