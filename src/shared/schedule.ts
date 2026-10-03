import type { ScheduleSpec } from './types';

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseField(src: string, min: number, max: number, name: string): Set<number> {
  const out = new Set<number>();
  for (const part of src.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`Invalid ${name} field "${src}"`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`Invalid step in ${name} field`);
    let lo = min;
    let hi = max;
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-').map(Number);
      lo = a;
      hi = b ?? (m[2] ? max : a);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`${name} must be between ${min} and ${max}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('Cron needs 5 fields: minute hour day-of-month month day-of-week');
  const dow = parseField(parts[4], 0, 7, 'day-of-week');
  if (dow.has(7)) { dow.delete(7); dow.add(0); }
  return {
    minute: parseField(parts[0], 0, 59, 'minute'),
    hour: parseField(parts[1], 0, 23, 'hour'),
    dom: parseField(parts[2], 1, 31, 'day-of-month'),
    month: parseField(parts[3], 1, 12, 'month'),
    dow,
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*'
  };
}

function nextCron(f: CronFields, after: number): number | null {
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 200_000; i++) {
    if (!f.month.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    const domOk = f.dom.has(d.getDate());
    const dowOk = f.dow.has(d.getDay());
    const dayOk = f.domRestricted && f.dowRestricted ? domOk || dowOk : domOk && dowOk;
    if (!dayOk) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!f.hour.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!f.minute.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    return d.getTime();
  }
  return null;
}

function parseTime(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Time must look like 09:30');
  return [Number(m[1]), Number(m[2])];
}

/** Throws a human-readable error if the spec is invalid. */
export function validateSpec(spec: ScheduleSpec): void {
  switch (spec.kind) {
    case 'interval':
      if (!Number.isFinite(spec.everyMinutes) || spec.everyMinutes < 1) throw new Error('Interval must be at least 1 minute.');
      return;
    case 'daily':
      parseTime(spec.time);
      if (!spec.days.length) throw new Error('Pick at least one day.');
      return;
    case 'cron':
      parseCron(spec.expr);
      return;
  }
}

/** Next fire time strictly after `after` (epoch ms), or null if none. */
export function nextRun(spec: ScheduleSpec, after: number): number | null {
  switch (spec.kind) {
    case 'interval':
      return after + Math.max(1, spec.everyMinutes) * 60_000;
    case 'daily': {
      const [h, m] = parseTime(spec.time);
      const d = new Date(after);
      for (let i = 0; i < 8; i++) {
        const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, h, m, 0, 0);
        if (c.getTime() > after && spec.days.includes(c.getDay())) return c.getTime();
      }
      return null;
    }
    case 'cron':
      return nextCron(parseCron(spec.expr), after);
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSpec(spec: ScheduleSpec): string {
  switch (spec.kind) {
    case 'interval': {
      const n = spec.everyMinutes;
      if (n % 1440 === 0) return n === 1440 ? 'Every day' : `Every ${n / 1440} days`;
      if (n % 60 === 0) return n === 60 ? 'Every hour' : `Every ${n / 60} hours`;
      return `Every ${n} minutes`;
    }
    case 'daily': {
      const days = [...spec.days].sort();
      const label =
        days.length === 7 ? 'Every day'
        : days.join() === '1,2,3,4,5' ? 'Weekdays'
        : days.map((d) => DAY_NAMES[d]).join(', ');
      return `${label} at ${spec.time}`;
    }
    case 'cron':
      return `Cron: ${spec.expr}`;
  }
}
