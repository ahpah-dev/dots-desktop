import React from 'react';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { DotView } from './components/DotView';
import { ApprovalBanner } from './components/ApprovalBanner';
import { NewDotModal } from './components/NewDotModal';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingModal } from './components/OnboardingModal';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const App: React.FC = () => {
  const { loading, toasts, dismissToast } = useApp();

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-muted)'
        }}
      >
        <div
          className="spin"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-full)',
            border: '2px solid var(--border-medium)',
            borderTopColor: 'var(--accent-primary)',
            marginBottom: '1rem'
          }}
        />
        <div style={{ fontSize: '0.85rem' }}>Initializing Dots...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toast Notification Float */}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 9999,
          pointerEvents: 'none'
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              background: 'var(--bg-card)',
              border: `1px solid ${
                t.level === 'error'
                  ? 'rgba(239, 68, 68, 0.4)'
                  : t.level === 'success'
                  ? 'rgba(16, 185, 129, 0.4)'
                  : 'var(--border-medium)'
              }`,
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              padding: '0.65rem 0.85rem',
              fontSize: '0.825rem',
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minWidth: '240px',
              maxWidth: '380px',
              animation: 'modal-enter 0.15s ease-out'
            }}
          >
            {t.level === 'success' && <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0 }} />}
            {t.level === 'error' && <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />}
            {t.level === 'info' && <Info size={15} style={{ color: '#818cf8', flexShrink: 0 }} />}

            <span style={{ flex: 1, lineHeight: 1.35 }}>{t.text}</span>

            <button
              className="btn-ghost"
              style={{ padding: '0.15rem' }}
              onClick={() => dismissToast(t.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Global Approval Banner if any approvals pending */}
      <ApprovalBanner />

      {/* Main Workspace Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar />
        <DotView />
      </div>

      {/* Overlays / Modals */}
      <NewDotModal />
      <SettingsModal />
      <OnboardingModal />
    </div>
  );
};
