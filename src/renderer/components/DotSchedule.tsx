import React, { useState } from 'react';
import { Clock, Calendar, Check, Play, AlertCircle, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Schedule, ScheduleSpec } from '@shared/types';
import { describeSpec, validateSpec } from '@shared/schedule';

interface DotScheduleProps {
  dotId: string;
}

export const DotSchedule: React.FC<DotScheduleProps> = ({ dotId }) => {
  const { activeDot, showToast } = useApp();

  const currentSchedule = activeDot?.schedule;

  const [enabled, setEnabled] = useState(currentSchedule?.enabled ?? false);
  const [kind, setKind] = useState<'interval' | 'daily' | 'cron'>(currentSchedule?.spec.kind ?? 'interval');
  const [everyMinutes, setEveryMinutes] = useState(
    currentSchedule?.spec.kind === 'interval' ? currentSchedule.spec.everyMinutes : 60
  );
  const [dailyTime, setDailyTime] = useState(
    currentSchedule?.spec.kind === 'daily' ? currentSchedule.spec.time : '09:00'
  );
  const [dailyDays, setDailyDays] = useState<number[]>(
    currentSchedule?.spec.kind === 'daily' ? currentSchedule.spec.days : [1, 2, 3, 4, 5]
  );
  const [cronExpr, setCronExpr] = useState(
    currentSchedule?.spec.kind === 'cron' ? currentSchedule.spec.expr : '0 9 * * 1-5'
  );
  const [prompt, setPrompt] = useState(
    currentSchedule?.prompt || 'Check project status, inspect any recent changes or errors, and write a summary.'
  );
  const [continueSession, setContinueSession] = useState(currentSchedule?.continueSession ?? false);
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => {
    setDailyDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const buildSpec = (): ScheduleSpec => {
    switch (kind) {
      case 'interval':
        return { kind: 'interval', everyMinutes: Math.max(1, Number(everyMinutes) || 60) };
      case 'daily':
        return { kind: 'daily', time: dailyTime, days: dailyDays.length ? dailyDays : [1, 2, 3, 4, 5] };
      case 'cron':
        return { kind: 'cron', expr: cronExpr.trim() };
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const spec = buildSpec();
      validateSpec(spec);

      const schedule: Schedule = {
        enabled,
        spec,
        prompt: prompt.trim(),
        continueSession
      };

      await window.dots.api.updateDot(dotId, { schedule });
      showToast(enabled ? 'Schedule saved and activated' : 'Schedule saved', 'success');
    } catch (err: any) {
      showToast(err.message || 'Invalid schedule configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  let specDescription = '';
  try {
    specDescription = describeSpec(buildSpec());
  } catch {
    specDescription = 'Invalid configuration';
  }

  const daysLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} style={{ color: 'var(--accent-warning)' }} /> Automated Schedules
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Run tasks automatically on a background cadence even when minimized or working on other things.
          </p>
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '0.825rem' }}>
          <Save size={14} /> Save Schedule
        </button>
      </div>

      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}
      >
        {/* Enable Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>Enable Background Schedule</div>
            <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              When enabled, {activeDot?.name} will run autonomously according to the frequency below.
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
          </label>
        </div>

        {/* Schedule Type Selection */}
        <div>
          <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
            Cadence Type
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {[
              { id: 'interval', label: 'Fixed Interval', desc: 'Every X minutes or hours' },
              { id: 'daily', label: 'Daily Time', desc: 'Specific time on chosen days' },
              { id: 'cron', label: 'Cron Expression', desc: 'Custom cron definition' }
            ].map((t) => (
              <div
                key={t.id}
                onClick={() => setKind(t.id as any)}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: `1.5px solid ${kind === t.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  background: kind === t.id ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-input)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: kind === t.id ? 'var(--accent-primary)' : 'var(--text-main)' }}>
                  {t.label}
                </div>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                  {t.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Type Specific Fields */}
        {kind === 'interval' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
              Run Every:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                min="1"
                max="10080"
                value={everyMinutes}
                onChange={(e) => setEveryMinutes(Math.max(1, Number(e.target.value)))}
                style={{ width: '120px' }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>minutes</span>

              <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '1rem' }}>
                {[15, 30, 60, 120, 1440].map((m) => (
                  <button
                    key={m}
                    className="btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: everyMinutes === m ? 'var(--bg-card-hover)' : 'transparent' }}
                    onClick={() => setEveryMinutes(m)}
                  >
                    {m === 60 ? '1 hour' : m === 120 ? '2 hours' : m === 1440 ? '1 day' : `${m}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {kind === 'daily' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                At Time (24h format):
              </label>
              <input
                type="text"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                placeholder="09:00"
                style={{ width: '120px', fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                On Days:
              </label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {daysLabels.map((name, idx) => {
                  const isChecked = dailyDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      className={isChecked ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                      onClick={() => toggleDay(idx)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {kind === 'cron' && (
          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
              Cron Expression (5 fields: min hour day month dow):
            </label>
            <input
              type="text"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 9 * * 1-5"
              style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
              Examples: <code>*/20 * * * *</code> (every 20 min), <code>0 9 * * 1-5</code> (weekdays at 9am)
            </div>
          </div>
        )}

        {/* Schedule Summary Preview */}
        <div
          style={{
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <strong>Summary:</strong> {specDescription}
          </div>
          {activeDot?.nextRunAt && (
            <div style={{ color: 'var(--accent-warning)', fontSize: '0.75rem' }}>
              Next run: {new Date(activeDot.nextRunAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Scheduled Task Prompt */}
        <div>
          <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
            Task Instructions to Execute on Cadence:
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            style={{ width: '100%', fontSize: '0.85rem', lineHeight: 1.4 }}
            placeholder="What should this Dot do every time the schedule fires?"
          />
        </div>

        {/* Options */}
        <div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem', color: 'var(--text-main)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={continueSession}
              onChange={(e) => setContinueSession(e.target.checked)}
            />
            Continue existing conversation thread instead of fresh session
          </label>
        </div>
      </div>
    </div>
  );
};
