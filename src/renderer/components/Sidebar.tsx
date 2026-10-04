import React, { useState } from 'react';
import {
  Plus,
  Settings,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Search,
  Bot
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { DotSummary } from '@shared/types';

export const Sidebar: React.FC = () => {
  const {
    bootstrap,
    activeDotId,
    setActiveDotId,
    setShowNewDotModal,
    setShowSettingsModal,
    auth,
    providers,
    approvals,
    showToast
  } = useApp();

  const [search, setSearch] = useState('');

  const dots = bootstrap?.dots ?? [];
  const filteredDots = dots.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.description.toLowerCase().includes(search.toLowerCase())
  );

  const anyWorking = dots.some((d) => d.status === 'running' || d.status === 'queued');

  const togglePause = async (e: React.MouseEvent, dot: DotSummary) => {
    e.stopPropagation();
    try {
      await window.dots.api.setDotPaused(dot.id, !dot.paused);
      showToast(dot.paused ? `Resumed "${dot.name}"` : `Paused "${dot.name}"`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle pause', 'error');
    }
  };

  const isConnected = (auth?.installed && auth?.loggedIn) || providers.some((p) => p.hasKey);

  return (
    <aside
      className="sidebar"
      style={{
        width: '270px',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '1.15rem 1.15rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: anyWorking ? '0 0 12px rgba(99, 102, 241, 0.6)' : 'none',
              transition: 'box-shadow var(--transition-normal)'
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: 'var(--radius-full)',
                background: '#ffffff',
                boxShadow: '0 0 4px rgba(255,255,255,0.8)'
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              Dots
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: 'var(--accent-primary)',
                  background: 'rgba(99, 102, 241, 0.15)',
                  padding: '0.1rem 0.35rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                v1.0
              </span>
            </div>
          </div>
        </div>

        <button
          className="btn-primary"
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
          onClick={() => setShowNewDotModal(true)}
          title="Create a new persistent AI agent"
        >
          <Plus size={14} /> New Dot
        </button>
      </div>

      {/* Filter / Search Bar */}
      {dots.length > 3 && (
        <div style={{ padding: '0.65rem 1.15rem 0.25rem' }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Search
              size={13}
              style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-dim)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="Filter Dots..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '1.85rem',
                paddingTop: '0.35rem',
                paddingBottom: '0.35rem',
                fontSize: '0.8rem'
              }}
            />
          </div>
        </div>
      )}

      {/* Dots List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.65rem' }}>
        <div
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-dim)',
            padding: '0.25rem 0.5rem 0.5rem'
          }}
        >
          Your Dots ({dots.length})
        </div>

        {filteredDots.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.825rem'
            }}
          >
            {dots.length === 0 ? (
              <>
                <Bot size={28} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No Dots created yet</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
                  Create an autonomous agent with its own workspace and memory.
                </div>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.785rem', width: '100%' }}
                  onClick={() => setShowNewDotModal(true)}
                >
                  <Plus size={14} /> Create First Dot
                </button>
              </>
            ) : (
              <div>No Dots matching "{search}"</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {filteredDots.map((dot) => {
              const isActive = dot.id === activeDotId;
              const isWorking = dot.status === 'running';
              const isAwaiting = dot.status === 'awaiting-approval';

              return (
                <div
                  key={dot.id}
                  className={`dot-list-item${isActive ? ' is-active' : ''}`}
                  style={{
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                  }}
                >
                  <button className="dot-select" aria-pressed={isActive} aria-label={`Select ${dot.name}`} onClick={() => setActiveDotId(dot.id)}>
                    {/* Dot Avatar */}
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: 'var(--radius-full)',
                        background: `${dot.color}22`,
                        border: `1.5px solid ${dot.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.95rem',
                        flexShrink: 0,
                        position: 'relative'
                      }}
                    >
                      {dot.emoji}
                      {isWorking && (
                        <div
                          className="pulse"
                          style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            width: '9px',
                            height: '9px',
                            borderRadius: 'var(--radius-full)',
                            background: '#10b981',
                            border: '1.5px solid var(--bg-sidebar)'
                          }}
                        />
                      )}
                    </div>

                    {/* Dot Details */}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: isActive ? 600 : 500,
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {dot.name}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                        <span className={`pill pill-${dot.status}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                          {isWorking && <span className="spin" style={{ display: 'inline-block' }}>◓</span>}
                          {isAwaiting ? 'Approval' : dot.status}
                        </span>

                        {dot.schedule?.enabled && (
                          <span
                            title="Scheduled task enabled"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: '0.65rem',
                              color: 'var(--accent-warning)',
                              background: 'rgba(245, 158, 11, 0.1)',
                              padding: '0.1rem 0.3rem',
                              borderRadius: 'var(--radius-sm)'
                            }}
                          >
                            <Clock size={10} style={{ marginRight: '0.15rem' }} />
                            Auto
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Pause / Resume Button */}
                  <button
                    className={`btn-ghost dot-pause-control${dot.paused ? ' is-paused' : ''}`}
                    style={{
                      padding: '0.25rem',
                      marginRight: '0.65rem',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    onClick={(e) => togglePause(e, dot)}
                    title={dot.paused ? 'Resume Dot' : 'Pause Dot'}
                    aria-label={`${dot.paused ? 'Resume' : 'Pause'} ${dot.name}`}
                  >
                    {dot.paused ? <Play size={13} style={{ color: '#10b981' }} /> : <Pause size={13} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approvals banner pill in sidebar if any */}
      {approvals.length > 0 && (
        <div
          style={{
            margin: '0.5rem 0.75rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: '#f87171'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
            <AlertTriangle size={13} />
            {approvals.length} Approval{approvals.length === 1 ? '' : 's'} Pending
          </div>
        </div>
      )}

      {/* Footer / Account & Settings Bar */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-card)'
        }}
      >
        <div
          onClick={() => setShowSettingsModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            minWidth: 0
          }}
          title="Open Settings & Accounts"
        >
          {isConnected ? (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: 'var(--radius-full)',
                background: '#10b981',
                boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
              }}
            />
          ) : (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: 'var(--radius-full)',
                background: '#f59e0b'
              }}
            />
          )}

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.785rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '160px'
              }}
            >
              {auth?.loggedIn ? (
                auth.mode === 'chatgpt' ? (
                  `Codex (${auth.plan || 'ChatGPT'})`
                ) : (
                  'Codex (API Key)'
                )
              ) : providers.length > 0 ? (
                providers[0].label
              ) : (
                'Auth Needed'
              )}
            </div>
            <div
              style={{
                fontSize: '0.675rem',
                color: 'var(--text-dim)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '160px'
              }}
            >
              {auth?.email || (isConnected ? 'Ready to execute' : 'Click to configure')}
            </div>
          </div>
        </div>

        <button
          className="btn-ghost"
          style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
          onClick={() => setShowSettingsModal(true)}
          title="App Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
};
