import React, { useState } from 'react';
import {
  X,
  Key,
  Shield,
  Sliders,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  Trash2,
  RefreshCw,
  Folder,
  Sun,
  Moon,
  Monitor,
  Power
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { ProviderProfileInput } from '@shared/types';

export const SettingsModal: React.FC = () => {
  const {
    showSettingsModal,
    setShowSettingsModal,
    settings,
    auth,
    loginProgress,
    providers,
    showToast,
    refreshBootstrap,
    refreshProviders
  } = useApp();

  const [tab, setTab] = useState<'accounts' | 'general'>('accounts');

  // Accounts state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [codexOverride, setCodexOverride] = useState(settings?.codexPathOverride ?? '');

  // Add Provider Profile state
  const [newLabel, setNewLabel] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('https://api.openai.com/v1');
  const [newModel, setNewModel] = useState('gpt-4o');
  const [newKey, setNewKey] = useState('');
  const [addingProvider, setAddingProvider] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  if (!showSettingsModal) return null;

  // Codex login handlers
  const handleStartBrowserLogin = async () => {
    try {
      setLoggingIn(true);
      await window.dots.api.startCodexLogin('browser');
      showToast('Opened browser sign-in...', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to start browser login', 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleStartDeviceLogin = async () => {
    try {
      setLoggingIn(true);
      await window.dots.api.startCodexLogin('device');
    } catch (err: any) {
      showToast(err.message || 'Failed to start device login', 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleApiKeyLogin = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      setLoggingIn(true);
      await window.dots.api.loginCodexWithApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      showToast('Signed in via API Key', 'success');
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Failed to sign in with API key', 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Log out from Codex?')) return;
    try {
      await window.dots.api.logoutCodex();
      showToast('Logged out of Codex', 'info');
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Failed to log out', 'error');
    }
  };

  const handleSaveCodexPath = async () => {
    try {
      await window.dots.api.updateSettings({ codexPathOverride: codexOverride.trim() });
      showToast('Codex path updated', 'success');
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Failed to update path', 'error');
    }
  };

  // Add Provider Profile handler
  const handleSaveProvider = async () => {
    if (!newLabel.trim() || !newBaseUrl.trim() || !newModel.trim()) {
      showToast('Fill in all provider fields', 'error');
      return;
    }
    try {
      setAddingProvider(true);
      const input: ProviderProfileInput = {
        label: newLabel.trim(),
        baseUrl: newBaseUrl.trim(),
        defaultModel: newModel.trim(),
        apiKey: newKey.trim() || undefined
      };
      await window.dots.api.saveProviderProfile(input);
      setNewLabel('');
      setNewKey('');
      showToast('Saved model provider profile', 'success');
      await refreshBootstrap();
      await refreshProviders();
    } catch (err: any) {
      showToast(err.message || 'Failed to save provider', 'error');
    } finally {
      setAddingProvider(false);
    }
  };

  const handleTestProvider = async (id: string) => {
    try {
      setTestingId(id);
      const res = await window.dots.api.testProvider(id);
      showToast(res.message, res.ok ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message || 'Test failed', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Delete this provider profile?')) return;
    try {
      await window.dots.api.deleteProviderProfile(id);
      showToast('Provider profile removed', 'info');
      await refreshBootstrap();
      await refreshProviders();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete provider', 'error');
    }
  };

  // General Settings update helpers
  const handleUpdateGeneral = async (patch: any) => {
    try {
      await window.dots.api.updateSettings(patch);
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Failed to update settings', 'error');
    }
  };

  const handlePickDefaultWorkspace = async () => {
    try {
      const chosen = await window.dots.api.pickFolder(settings?.defaultWorkspaceRoot);
      if (chosen) handleUpdateGeneral({ defaultWorkspaceRoot: chosen });
    } catch (err: any) {
      showToast(err.message || 'Failed to pick folder', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn-ghost"
              style={{
                fontWeight: tab === 'accounts' ? 600 : 500,
                color: tab === 'accounts' ? 'var(--text-main)' : 'var(--text-muted)',
                borderBottom: `2px solid ${tab === 'accounts' ? 'var(--accent-primary)' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)'
              }}
              onClick={() => setTab('accounts')}
            >
              <Key size={15} /> Accounts & Models
            </button>
            <button
              className="btn-ghost"
              style={{
                fontWeight: tab === 'general' ? 600 : 500,
                color: tab === 'general' ? 'var(--text-main)' : 'var(--text-muted)',
                borderBottom: `2px solid ${tab === 'general' ? 'var(--accent-primary)' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)'
              }}
              onClick={() => setTab('general')}
            >
              <Sliders size={15} /> App Settings
            </button>
          </div>

          <button className="btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setShowSettingsModal(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '72vh' }}>
          {tab === 'accounts' ? (
            <>
              {/* Codex Section */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>OpenAI Codex</div>
                    <span
                      className={`pill ${auth?.loggedIn ? 'pill-running' : 'pill-idle'}`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {auth?.loggedIn ? 'Connected' : auth?.installed ? 'Not Signed In' : 'Not Installed'}
                    </span>
                  </div>

                  <button className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => refreshBootstrap()}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.45 }}>
                  Dots natively connects to your local Codex CLI session. If you are signed in with ChatGPT (Plus/Pro) or an API key, Dots automatically uses your account without requiring manual key copying.
                </p>

                {auth?.loggedIn ? (
                  <div
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.825rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {auth.mode === 'chatgpt' ? `ChatGPT Account (${auth.plan || 'Plus'})` : 'OpenAI API Key'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                        {auth.email || 'Authenticated via local Codex CLI'} • Codex {auth.codexVersion || 'v0.144+'}
                      </div>
                    </div>

                    <button className="btn-secondary" onClick={handleLogout} style={{ fontSize: '0.775rem' }}>
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-primary"
                        onClick={handleStartBrowserLogin}
                        disabled={loggingIn || !auth?.installed}
                        style={{ fontSize: '0.8rem', flex: 1 }}
                      >
                        Sign in with ChatGPT (Browser)
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={handleStartDeviceLogin}
                        disabled={loggingIn || !auth?.installed}
                        style={{ fontSize: '0.8rem' }}
                      >
                        Device Code
                      </button>
                    </div>

                    {loginProgress?.active && (
                      <div
                        style={{
                          background: 'rgba(99, 102, 241, 0.08)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.75rem',
                          fontSize: '0.8rem',
                          color: '#818cf8'
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{loginProgress.message}</div>
                        {loginProgress.code && (
                          <div style={{ fontSize: '1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, margin: '0.4rem 0' }}>
                            Code: <span style={{ color: '#ffffff' }}>{loginProgress.code}</span>
                          </div>
                        )}
                        {loginProgress.url && (
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              window.dots.api.openExternal(loginProgress.url!);
                            }}
                            style={{ color: '#818cf8', textDecoration: 'underline', fontSize: '0.75rem' }}
                          >
                            Open authorization link
                          </a>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <input
                        type="password"
                        placeholder="Or enter OpenAI API key (sk-...)"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        style={{ flex: 1, fontSize: '0.8rem' }}
                      />
                      <button
                        className="btn-secondary"
                        onClick={handleApiKeyLogin}
                        disabled={loggingIn || !apiKeyInput.trim()}
                        style={{ fontSize: '0.8rem' }}
                      >
                        Save Key
                      </button>
                    </div>
                  </div>
                )}

                {/* Codex Executable Path Override */}
                <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.35rem' }}>
                    Codex Executable Path Override (Optional):
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder={auth?.codexPath || 'Auto-detected on PATH'}
                      value={codexOverride}
                      onChange={(e) => setCodexOverride(e.target.value)}
                      style={{ flex: 1, fontSize: '0.785rem', fontFamily: 'var(--font-mono)' }}
                    />
                    <button className="btn-secondary" onClick={handleSaveCodexPath} style={{ fontSize: '0.785rem' }}>
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              {/* External OpenAI-Compatible Providers Section */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                  OpenAI-Compatible Custom Providers
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.45 }}>
                  Add any OpenAI-compatible API endpoint (e.g. OpenAI direct API key, Groq, Ollama, OpenRouter, vLLM). API keys are encrypted locally using OS secure storage and never exposed.
                </p>

                {/* Existing Providers List */}
                {providers.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    {providers.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.65rem 0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.825rem'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.label}</div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {p.baseUrl} • {p.defaultModel}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            className="btn-ghost"
                            onClick={() => handleTestProvider(p.id)}
                            disabled={testingId === p.id}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            <RefreshCw size={12} className={testingId === p.id ? 'spin' : ''} /> Test
                          </button>
                          <button
                            className="btn-danger"
                            onClick={() => handleDeleteProvider(p.id)}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.45rem' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Profile Form */}
                <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                    Add Custom Endpoint Profile
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                        Display Label
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Groq or Local Ollama"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        style={{ width: '100%', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                        Default Model
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. gpt-4o or llama3"
                        value={newModel}
                        onChange={(e) => setNewModel(e.target.value)}
                        style={{ width: '100%', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                      Base URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://api.openai.com/v1"
                      value={newBaseUrl}
                      onChange={(e) => setNewBaseUrl(e.target.value)}
                      style={{ width: '100%', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div style={{ marginBottom: '0.85rem' }}>
                    <label style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>
                      API Key (Encrypted securely)
                    </label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      style={{ width: '100%', fontSize: '0.8rem' }}
                    />
                  </div>

                  <button
                    className="btn-primary"
                    onClick={handleSaveProvider}
                    disabled={addingProvider || !newLabel.trim() || !newKey.trim()}
                    style={{ fontSize: '0.8rem', width: '100%' }}
                  >
                    <Plus size={14} /> Save Endpoint Profile
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* General Settings Tab */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>
                  Background Execution & Desktop
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Run in Background (System Tray)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Closing the window minimizes to tray so your Dots can continue executing tasks.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings?.runInBackground ?? true}
                      onChange={(e) => handleUpdateGeneral({ runInBackground: e.target.checked })}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Launch at System Login
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Start Dots automatically on login to service background scheduled tasks.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings?.launchAtLogin ?? false}
                      onChange={(e) => handleUpdateGeneral({ launchAtLogin: e.target.checked })}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Desktop Notifications
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Receive OS notifications when a Dot finishes a task or requires human approval.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings?.desktopNotifications ?? true}
                      onChange={(e) => handleUpdateGeneral({ desktopNotifications: e.target.checked })}
                    />
                  </div>
                </div>
              </div>

              {/* Concurrency and Workspace */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>
                  Workspace & Resource Limits
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Max Concurrent Running Tasks ({settings?.maxConcurrentRuns ?? 3})
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={settings?.maxConcurrentRuns ?? 3}
                      onChange={(e) => handleUpdateGeneral({ maxConcurrentRuns: Number(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Default New Dot Workspace Folder
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={settings?.defaultWorkspaceRoot ?? ''}
                        readOnly
                        style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                      />
                      <button className="btn-secondary" onClick={handlePickDefaultWorkspace} style={{ fontSize: '0.8rem' }}>
                        Browse...
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme & Quit */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
                  Appearance & Session
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                  {[
                    { id: 'system', label: 'System', icon: <Monitor size={14} /> },
                    { id: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                    { id: 'light', label: 'Light', icon: <Sun size={14} /> }
                  ].map((t) => (
                    <button
                      key={t.id}
                      className={settings?.theme === t.id ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: '0.8rem', flex: 1 }}
                      onClick={() => handleUpdateGeneral({ theme: t.id })}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-danger"
                    onClick={() => window.dots.api.quitApp()}
                    style={{ fontSize: '0.8rem' }}
                  >
                    <Power size={14} /> Quit Dots Completely
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
