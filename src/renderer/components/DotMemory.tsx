import React, { useState, useEffect } from 'react';
import { Brain, Save, RefreshCw, Trash2, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface DotMemoryProps {
  dotId: string;
}

export const DotMemory: React.FC<DotMemoryProps> = ({ dotId }) => {
  const { activeDot, showToast } = useApp();
  const [memory, setMemory] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMemory = async () => {
    try {
      setLoading(true);
      const text = await window.dots.api.getMemory(dotId);
      setMemory(text);
    } catch (err: any) {
      showToast(err.message || 'Failed to load memory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemory();
  }, [dotId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await window.dots.api.saveMemory(dotId, memory);
      showToast('Memory updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save memory', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm(`Clear all long-term memory for "${activeDot?.name}"?`)) return;
    try {
      setSaving(true);
      await window.dots.api.saveMemory(dotId, '');
      setMemory('');
      showToast('Memory cleared', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to clear memory', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Brain size={18} style={{ color: '#ec4899' }} /> Persistent Memory
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Facts and conventions this Dot remembers between tasks and scheduled runs.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn-ghost" onClick={loadMemory} disabled={loading} title="Reload memory">
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn-danger" onClick={handleClear} disabled={saving || !memory.trim()} style={{ fontSize: '0.8rem' }}>
            <Trash2 size={13} /> Clear
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '0.8rem' }}>
            <Save size={14} /> Save Memory
          </button>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(99, 102, 241, 0.06)',
          border: '1px solid rgba(99, 102, 241, 0.18)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1rem',
          marginBottom: '1.25rem',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          lineHeight: 1.45,
          display: 'flex',
          gap: '0.75rem'
        }}
      >
        <Info size={16} style={{ color: '#818cf8', flexShrink: 0, marginTop: '0.1rem' }} />
        <div>
          <strong style={{ color: 'var(--text-main)' }}>Autonomous Memory Updates:</strong> After finishing a task, {activeDot?.name} automatically notes down helpful durable facts (such as build commands, architecture notes, user preferences). You can also manually review or edit its memory at any time.
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
        <textarea
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder={`# Durable facts for ${activeDot?.name}\n- User prefers TypeScript strict mode\n- Database migrations are run using npm run db:migrate\n- API documentation is hosted at /docs`}
          rows={18}
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-main)',
            resize: 'vertical',
            outline: 'none',
            boxShadow: 'none'
          }}
        />
      </div>
    </div>
  );
};
