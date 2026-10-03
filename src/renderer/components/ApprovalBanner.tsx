import React, { useState } from 'react';
import { AlertCircle, Check, X, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ApprovalBanner: React.FC = () => {
  const { approvals, activeDotId, showToast } = useApp();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Filter approvals for current active dot first, or show any pending approval
  const relevant = approvals.find((a) => a.dotId === activeDotId) ?? approvals[0];

  if (!relevant) return null;

  const handleResolve = async (approve: boolean) => {
    try {
      setResolvingId(relevant.id);
      await window.dots.api.resolveApproval(relevant.id, approve);
      showToast(approve ? 'Action approved' : 'Action declined', approve ? 'success' : 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to resolve approval', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.12)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
        padding: '0.75rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        zIndex: 50
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            padding: '0.4rem',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <ShieldAlert size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f87171' }}>
            Approval required by <span style={{ color: '#ffffff' }}>{relevant.dotName}</span>
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '650px'
            }}
          >
            <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{relevant.summary}</span>
            {relevant.detail && ` — ${relevant.detail.slice(0, 140)}`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <button
          className="btn-danger"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          onClick={() => handleResolve(false)}
          disabled={resolvingId === relevant.id}
        >
          <X size={14} /> Deny
        </button>
        <button
          className="btn-primary"
          style={{
            background: '#10b981',
            borderColor: '#059669',
            padding: '0.35rem 0.75rem',
            fontSize: '0.8rem'
          }}
          onClick={() => handleResolve(true)}
          disabled={resolvingId === relevant.id}
        >
          <Check size={14} /> Approve Action
        </button>
      </div>
    </div>
  );
};
