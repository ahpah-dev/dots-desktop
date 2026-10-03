import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Terminal,
  FileCode,
  Globe,
  Search,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  Square,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Run, RunEvent, ToolCategory } from '@shared/types';

interface RunTimelineProps {
  dotId: string;
}

export const RunTimeline: React.FC<RunTimelineProps> = ({ dotId }) => {
  const {
    activeDot,
    runs,
    selectedRunId,
    setSelectedRunId,
    activeRunEvents,
    streamingDraft,
    showToast,
    refreshRuns
  } = useApp();

  const [prompt, setPrompt] = useState('');
  const [newSession, setNewSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;
  const isBusy = activeDot?.status === 'running' || activeDot?.status === 'queued';

  // Auto-scroll on new events if user is near bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeRunEvents.length, streamingDraft]);

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStartRun = async (customPrompt?: string) => {
    const textToRun = (customPrompt || prompt).trim();
    if (!textToRun || isBusy || submitting) return;

    try {
      setSubmitting(true);
      const run = await window.dots.api.startRun(dotId, textToRun, { newSession });
      setPrompt('');
      setSelectedRunId(run.id);
      showToast(`Task started for "${activeDot?.name}"`, 'info');
      await refreshRuns();
    } catch (err: any) {
      showToast(err.message || 'Failed to start task', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopRun = async () => {
    if (!selectedRun) return;
    try {
      await window.dots.api.cancelRun(selectedRun.id);
      showToast('Stopping task...', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to stop task', 'error');
    }
  };

  const handleCopyResult = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Copied to clipboard', 'info');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleStartRun();
    }
  };

  const getToolIcon = (category: ToolCategory) => {
    switch (category) {
      case 'shell':
        return <Terminal size={14} style={{ color: '#38bdf8' }} />;
      case 'file':
        return <FileCode size={14} style={{ color: '#34d399' }} />;
      case 'search':
        return <Search size={14} style={{ color: '#fbbf24' }} />;
      case 'web':
        return <Globe size={14} style={{ color: '#818cf8' }} />;
      case 'memory':
        return <Brain size={14} style={{ color: '#ec4899' }} />;
      default:
        return <Layers size={14} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Task Header / Status Bar */}
      {selectedRun && (
        <div
          style={{
            padding: '0.65rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <span className={`pill pill-${selectedRun.status}`}>
              {selectedRun.status === 'succeeded' && <CheckCircle2 size={12} />}
              {selectedRun.status === 'failed' && <XCircle size={12} />}
              {selectedRun.status === 'running' && <span className="spin">◓</span>}
              {selectedRun.status === 'queued' && <Clock size={12} />}
              {selectedRun.status}
            </span>

            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '450px'
              }}
              title={selectedRun.title}
            >
              {selectedRun.title}
            </div>

            {selectedRun.trigger === 'schedule' && (
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--accent-warning)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  padding: '0.15rem 0.45rem',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                Scheduled
              </span>
            )}

            {selectedRun.usage && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                {(selectedRun.usage.inputTokens + selectedRun.usage.outputTokens).toLocaleString()} tokens
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {(selectedRun.status === 'running' || selectedRun.status === 'queued') && (
              <button
                className="btn-danger"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={handleStopRun}
              >
                <Square size={13} /> Stop
              </button>
            )}
          </div>
        </div>
      )}

      {/* Events / Timeline Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        {!selectedRun ? (
          /* Empty state with helpful prompt suggestions */
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: 'var(--text-muted)',
              padding: '2rem'
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                background: `${activeDot?.color || '#6366f1'}1a`,
                border: `2px solid ${activeDot?.color || '#6366f1'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                marginBottom: '1rem'
              }}
            >
              {activeDot?.emoji || '🤖'}
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              {activeDot?.name} is ready
            </h3>
            <p style={{ maxWidth: '420px', fontSize: '0.875rem', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
              Give this Dot a goal. It will autonomously inspect files, write code, run shell commands, browse the web, and store facts in its memory.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', maxWidth: '580px', width: '100%' }}>
              {[
                { title: 'Explore Workspace', p: 'List all files in your workspace, inspect the project setup, and give a concise overview.' },
                { title: 'Live Web Research', p: 'Search the web for the latest developments in AI agents and write a concise briefing.' },
                { title: 'Inspect & Run Tests', p: 'Check if there are any test files or scripts in the workspace and execute them.' },
                { title: 'Code Improvement', p: 'Analyze the code in the workspace and suggest or implement modular improvements.' }
              ].map((suggestion, idx) => (
                <div
                  key={idx}
                  onClick={() => handleStartRun(suggestion.p)}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem 1rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    {suggestion.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {suggestion.p}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxWidth: '880px', margin: '0 auto' }}>
            {/* User prompt card */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.15rem',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '0.35rem' }}>
                TASK INSTRUCTION
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {selectedRun.prompt}
              </div>
            </div>

            {/* Timeline Events */}
            {activeRunEvents.map((ev, index) => {
              const key = `event-${index}-${ev.seq}`;

              if (ev.type === 'message') {
                return (
                  <div
                    key={key}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem 1.15rem'
                    }}
                  >
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{ev.text}</ReactMarkdown>
                    </div>
                  </div>
                );
              }

              if (ev.type === 'reasoning') {
                const isExpanded = expandedItems[key] ?? false;
                return (
                  <div
                    key={key}
                    style={{
                      background: 'rgba(99, 102, 241, 0.05)',
                      border: '1px solid rgba(99, 102, 241, 0.2)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      onClick={() => toggleExpand(key)}
                      style={{
                        padding: '0.5rem 0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontSize: '0.785rem',
                        fontWeight: 600,
                        color: '#818cf8'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Brain size={14} />
                        Thought process
                      </div>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                    {isExpanded && (
                      <div
                        style={{
                          padding: '0.75rem 1rem',
                          borderTop: '1px solid rgba(99, 102, 241, 0.15)',
                          fontSize: '0.825rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {ev.text}
                      </div>
                    )}
                  </div>
                );
              }

              if (ev.type === 'tool') {
                const isExpanded = expandedItems[key] ?? (ev.status === 'running' || ev.status === 'error');
                const isError = ev.status === 'error';

                return (
                  <div
                    key={key}
                    style={{
                      background: 'var(--bg-card)',
                      border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      onClick={() => toggleExpand(key)}
                      style={{
                        padding: '0.55rem 0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: 'var(--bg-card-hover)',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                        {getToolIcon(ev.category)}
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{ev.name}</span>
                        {ev.input && (
                          <span
                            style={{
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '450px'
                            }}
                          >
                            {ev.input}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        {ev.status === 'running' && (
                          <span className="pill pill-running" style={{ fontSize: '0.65rem' }}>
                            <span className="spin">◓</span> executing
                          </span>
                        )}
                        {ev.status === 'ok' && (
                          <span style={{ color: '#10b981', display: 'flex' }}>
                            <Check size={14} />
                          </span>
                        )}
                        {ev.status === 'error' && (
                          <span className="pill pill-awaiting-approval" style={{ fontSize: '0.65rem' }}>
                            Failed
                          </span>
                        )}
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    </div>

                    {isExpanded && (ev.output || ev.input) && (
                      <div
                        style={{
                          padding: '0.65rem 0.85rem',
                          borderTop: '1px solid var(--border-subtle)',
                          background: '#090a0d',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.775rem',
                          color: isError ? '#f87171' : '#cbd5e1',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.45
                        }}
                      >
                        {ev.output || ev.input}
                      </div>
                    )}
                  </div>
                );
              }

              if (ev.type === 'file') {
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.35rem 0.65rem',
                      background: 'rgba(52, 211, 153, 0.08)',
                      border: '1px solid rgba(52, 211, 153, 0.2)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.785rem',
                      color: '#34d399'
                    }}
                  >
                    <FileCode size={13} />
                    <span>{ev.change === 'add' ? 'Created' : ev.change === 'delete' ? 'Deleted' : 'Modified'}:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)', fontWeight: 500 }}>
                      {ev.path}
                    </span>
                  </div>
                );
              }

              if (ev.type === 'log') {
                return (
                  <div
                    key={key}
                    style={{
                      fontSize: '0.75rem',
                      color: ev.level === 'error' ? '#ef4444' : ev.level === 'warn' ? '#f59e0b' : 'var(--text-dim)',
                      padding: '0.2rem 0.5rem'
                    }}
                  >
                    • {ev.text}
                  </div>
                );
              }

              if (ev.type === 'final') {
                return (
                  <div
                    key={key}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      boxShadow: 'var(--shadow-md)',
                      marginTop: '0.5rem'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.75rem',
                        paddingBottom: '0.5rem',
                        borderBottom: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>
                        <CheckCircle2 size={16} /> Result
                      </div>
                      <button
                        className="btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => handleCopyResult(ev.text)}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{ev.text}</ReactMarkdown>
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Live Streaming Draft preview */}
            {streamingDraft && (
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem 1.15rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#818cf8', marginBottom: '0.5rem' }}>
                  <span className="spin">◓</span> Generating response...
                </div>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingDraft}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Error banner if task failed */}
            {selectedRun.status === 'failed' && selectedRun.error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  color: '#f87171',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <XCircle size={15} /> Task Error
                </div>
                <div style={{ lineHeight: 1.45 }}>{selectedRun.error}</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Prompt Input Bar */}
      <div
        style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)'
        }}
      >
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>
          <div
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              transition: 'border-color var(--transition-fast)'
            }}
            onFocus={() => {
              const el = document.getElementById('prompt-input-container');
              if (el) el.style.borderColor = 'var(--border-focus)';
            }}
          >
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isBusy
                  ? `${activeDot?.name} is currently working on a task...`
                  : `Assign a task to ${activeDot?.name || 'Dot'}... (Press Ctrl+Enter to run)`
              }
              disabled={isBusy || submitting}
              rows={2}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                padding: 0,
                outline: 'none',
                boxShadow: 'none',
                color: 'var(--text-main)',
                fontSize: '0.875rem',
                lineHeight: 1.4,
                resize: 'none'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-dim)',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={newSession}
                  onChange={(e) => setNewSession(e.target.checked)}
                />
                Start fresh session (new thread)
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className="btn-primary"
                  onClick={() => handleStartRun()}
                  disabled={!prompt.trim() || isBusy || submitting}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.825rem' }}
                >
                  <Send size={13} /> Run Task
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
