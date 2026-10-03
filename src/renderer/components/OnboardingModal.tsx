import React, { useState } from 'react';
import { Sparkles, CheckCircle2, Key, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const OnboardingModal: React.FC = () => {
  const {
    showOnboardingModal,
    setShowOnboardingModal,
    auth,
    loginProgress,
    showToast,
    refreshBootstrap
  } = useApp();

  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  if (!showOnboardingModal) return null;

  const isCodexConnected = auth?.installed && auth?.loggedIn;

  const handleFinishOnboarding = async () => {
    try {
      await window.dots.api.updateSettings({ onboardingComplete: true });
      setShowOnboardingModal(false);
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Error finishing onboarding', 'error');
    }
  };

  const handleStartBrowserLogin = async () => {
    try {
      setLoading(true);
      await window.dots.api.startCodexLogin('browser');
    } catch (err: any) {
      showToast(err.message || 'Failed to start browser login', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    try {
      setLoading(true);
      await window.dots.api.loginCodexWithApiKey(apiKey.trim());
      showToast('API key saved successfully', 'success');
      await handleFinishOnboarding();
    } catch (err: any) {
      showToast(err.message || 'Failed to save API key', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '520px', padding: '2rem 2.25rem', textAlign: 'center' }}>
        {/* Logo and Greeting */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--radius-full)',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)'
          }}
        >
          <div style={{ width: '14px', height: '14px', borderRadius: 'var(--radius-full)', background: '#ffffff' }} />
        </div>

        <h2 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.45rem' }}>
          Welcome to Dots
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.5 }}>
          Create persistent, autonomous AI agents with dedicated workspaces, long-term memory, and background scheduling.
        </p>

        {/* Auto-detected Codex connection card */}
        {isCodexConnected ? (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1.5px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              textAlign: 'left',
              marginBottom: '1.5rem',
              display: 'flex',
              gap: '0.85rem'
            }}
          >
            <CheckCircle2 size={24} style={{ color: '#10b981', flexShrink: 0, marginTop: '0.1rem' }} />
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                OpenAI Codex Detected & Connected
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.45 }}>
                Found your authenticated Codex session{' '}
                <strong style={{ color: '#ffffff' }}>
                  ({auth.mode === 'chatgpt' ? `ChatGPT ${auth.plan || 'Plus'}` : 'API key'}
                  {auth.email ? `: ${auth.email}` : ''})
                </strong>
                . Dots is ready to execute tasks immediately without manual API key entry.
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              textAlign: 'left',
              marginBottom: '1.5rem'
            }}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              Connect Your Account
            </div>
            <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.4 }}>
              Sign in with your ChatGPT Plus / Team account via official OpenAI browser login, or enter an API key.
            </p>

            <button
              className="btn-primary"
              onClick={handleStartBrowserLogin}
              disabled={loading || !auth?.installed}
              style={{ width: '100%', marginBottom: '0.75rem', padding: '0.6rem' }}
            >
              <ShieldCheck size={16} /> Sign in with ChatGPT (Browser)
            </button>

            {loginProgress?.active && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.65rem',
                  fontSize: '0.8rem',
                  color: '#818cf8',
                  marginBottom: '0.75rem'
                }}
              >
                <div>{loginProgress.message}</div>
                {loginProgress.url && (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.dots.api.openExternal(loginProgress.url!);
                    }}
                    style={{ color: '#818cf8', textDecoration: 'underline', marginTop: '0.25rem', display: 'inline-block' }}
                  >
                    Open login page
                  </a>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="password"
                placeholder="Or paste OpenAI API Key (sk-...)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{ flex: 1, fontSize: '0.8rem' }}
              />
              <button
                className="btn-secondary"
                onClick={handleSaveApiKey}
                disabled={loading || !apiKey.trim()}
                style={{ fontSize: '0.8rem' }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Start Button */}
        <button
          className="btn-primary"
          onClick={handleFinishOnboarding}
          style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 600 }}
        >
          {isCodexConnected ? 'Get Started with Dots' : 'Continue to Dots'} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};
