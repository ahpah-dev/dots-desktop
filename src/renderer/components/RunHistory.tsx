import React from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Calendar,
  Sparkles
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const RunHistory: React.FC = () => {
  const { runs, selectedRunId, setSelectedRunId, showToast, refreshRuns } = useApp();

  const handleDeleteRun = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    try {
      await window.dots.api.deleteRun(runId);
      showToast('Run history deleted', 'info');
      await refreshRuns();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete run', 'error');
    }
  };

  return (
    <div
      style={{
        width: '240px',
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      <div
        style={{
          padding: '0.75rem 0.85rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          History ({runs.length})
        </span>

        <button
          className="btn-ghost"
          style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
          onClick={() => setSelectedRunId(null)}
          title="New Task view"
        >
          <Plus size={12} /> New
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {runs.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '0.75rem'
            }}
          >
            No previous tasks recorded for this Dot yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {runs.map((r) => {
              const isSelected = r.id === selectedRunId;
              const dateStr = new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const isRunning = r.status === 'running' || r.status === 'queued';

              return (
                <div
                  key={r.id}
                  className="history-item"
                  onClick={() => setSelectedRunId(r.id)}
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    transition: 'all var(--transition-fast)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                      {r.status === 'succeeded' && <CheckCircle2 size={12} style={{ color: '#10b981', flexShrink: 0 }} />}
                      {r.status === 'failed' && <XCircle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />}
                      {isRunning && <span className="spin" style={{ color: '#818cf8', fontSize: '0.75rem' }}>◓</span>}
                      {r.status === 'cancelled' && <Clock size={12} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}

                      <span
                        style={{
                          fontSize: '0.775rem',
                          fontWeight: isSelected ? 600 : 500,
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={r.title}
                      >
                        {r.title}
                      </span>
                    </div>

                    {!isRunning && (
                      <button
                        className="btn-ghost"
                        style={{ padding: '0.15rem', opacity: 0.4 }}
                        onClick={(e) => handleDeleteRun(e, r.id)}
                        title="Delete run record"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.675rem', color: 'var(--text-dim)' }}>
                    <span>{dateStr}</span>
                    {r.trigger === 'schedule' ? (
                      <span style={{ color: 'var(--accent-warning)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Calendar size={10} /> Auto
                      </span>
                    ) : (
                      <span>Manual</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
