import { describe, expect, it } from 'vitest';
import type { ScheduleSpec } from '@shared/types';
import { describeSpec, nextRun, parseCron, validateSpec } from '@shared/schedule';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

describe('schedule', () => {
  it('interval adds minutes', () => {
    expect(nextRun({ kind: 'interval', everyMinutes: 15 }, 1000)).toBe(1000 + 15 * 60_000);
  });

  it('daily picks the next matching day/time', () => {
    // Wed 2026-10-07 10:00; weekdays at 09:00 -> Thu 2026-10-08 09:00
    const spec: ScheduleSpec = { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] };
    expect(nextRun(spec, at(2026, 10, 7, 10, 0))).toBe(at(2026, 10, 8, 9, 0));
    // Fri 2026-10-09 10:00 -> Mon 2026-10-12 09:00
    expect(nextRun(spec, at(2026, 10, 9, 10, 0))).toBe(at(2026, 10, 12, 9, 0));
    // same day later
    expect(nextRun(spec, at(2026, 10, 7, 8, 0))).toBe(at(2026, 10, 7, 9, 0));
  });

  it('cron: step and list fields', () => {
    expect(nextRun({ kind: 'cron', expr: '*/20 * * * *' }, at(2026, 1, 1, 10, 5))).toBe(at(2026, 1, 1, 10, 20));
    expect(nextRun({ kind: 'cron', expr: '30 8,17 * * *' }, at(2026, 1, 1, 9, 0))).toBe(at(2026, 1, 1, 17, 30));
  });

  it('cron: day-of-week and month rollover', () => {
    // Every Monday 07:00; from Fri 2026-10-09 -> Mon 2026-10-12
    expect(nextRun({ kind: 'cron', expr: '0 7 * * 1' }, at(2026, 10, 9, 12, 0))).toBe(at(2026, 10, 12, 7, 0));
    // 1st of the month at midnight
    expect(nextRun({ kind: 'cron', expr: '0 0 1 * *' }, at(2026, 12, 15, 0, 0))).toBe(at(2027, 1, 1, 0, 0));
  });

  it('cron: 7 means Sunday', () => {
    expect(parseCron('0 0 * * 7').dow.has(0)).toBe(true);
  });

  it('rejects invalid specs', () => {
    expect(() => validateSpec({ kind: 'cron', expr: '* * *' })).toThrow();
    expect(() => validateSpec({ kind: 'cron', expr: '61 * * * *' })).toThrow();
    expect(() => validateSpec({ kind: 'daily', time: '25:00', days: [1] })).toThrow();
    expect(() => validateSpec({ kind: 'daily', time: '09:00', days: [] })).toThrow();
    expect(() => validateSpec({ kind: 'interval', everyMinutes: 0 })).toThrow();
  });

  it('describes specs', () => {
    expect(describeSpec({ kind: 'interval', everyMinutes: 60 })).toBe('Every hour');
    expect(describeSpec({ kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] })).toBe('Weekdays at 09:00');
  });
});
