import React, { useState, useEffect } from 'react';
import { X, Sparkles, Folder, Cpu, Plus, Code, Search, Clock, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { DotInput, FileAccess } from '@shared/types';
import { CODEX_PROVIDER_ID } from '@shared/types';

interface Template {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  instructions: string;
  files: FileAccess;
  shell: boolean;
  web: boolean;
}

const TEMPLATES: Template[] = [
  {
    id: 'developer',
    name: 'Software Engineer',
    description: 'Autonomous coding agent that builds features, fixes bugs, and tests code.',
    emoji: '💻',
    color: '#6366f1',
    instructions:
      'You are a senior software engineer. When given a task:\n1. Inspect existing files before changing them.\n2. Write clean, modular, typed code with clear comments.\n3. Run tests or build checks when appropriate.\n4. Summarize changes clearly.',
    files: 'write',
    shell: true,
    web: true
  },
  {
    id: 'researcher',
    name: 'Web Researcher',
    description: 'Gathers live intelligence, monitors developments, and compiles clear reports.',
    emoji: '🔍',
    color: '#10b981',
    instructions:
      'You are a precise research analyst. Search the web, verify sources, fetch relevant articles, and compile structured briefings with sources cited.',
    files: 'write',
    shell: false,
    web: true
  },
  {
    id: 'watchdog',
    name: 'Scheduled Watchdog',
    description: 'Runs on background cadence to inspect project health, test status, and alert on issues.',
    emoji: '⏱️',
    color: '#f59e0b',
    instructions:
      'You are an automated project watchdog. Run diagnostic checks, inspect git status or logs, and notify of any regressions or pending tasks.',
    files: 'read',
    shell: true,
    web: true
  },
  {
    id: 'writer',
    name: 'Doc Specialist',
    description: 'Maintains documentation, architecture notes, changelogs, and user guides.',
    emoji: '✍️',
    color: '#ec4899',
    instructions:
      'You are a technical writer. Read the codebase and produce crisp, accurate, readable documentation and release notes in Markdown.',
    files: 'write',
    shell: false,
    web: false
  },
  {
    id: 'blank',
    name: 'Custom Dot',
    description: 'A blank autonomous agent configured from scratch.',
    emoji: '🤖',
    color: '#3b82f6',
    instructions: 'You are an autonomous AI assistant dedicated to this workspace.',
    files: 'write',
    shell: true,
    web: true
  }
];

export const NewDotModal: React.FC = () => {
  const {
    showNewDotModal,
    setShowNewDotModal,
    providerOptions,
    setActiveDotId,
    showToast,
    refreshBootstrap
  } = useApp();

  const [selectedTemplate, setSelectedTemplate] = useState<string>('developer');
  const [name, setName] = useState('Software Engineer');
  const [description, setDescription] = useState(
    'Autonomous coding agent that builds features, fixes bugs, and tests code.'
  );
  const [emoji, setEmoji] = useState('💻');
  const [color, setColor] = useState('#6366f1');
  const [instructions, setInstructions] = useState(TEMPLATES[0].instructions);
  const [workspacePath, setWorkspacePath] = useState('');
  const [providerId, setProviderId] = useState(CODEX_PROVIDER_ID);
  const [files, setFiles] = useState<FileAccess>('write');
  const [shell, setShell] = useState(true);
  const [web, setWeb] = useState(true);
  const [creating, setCreating] = useState(false);

  // Update default workspace whenever name changes
  useEffect(() => {
    if (!name.trim()) return;
    let active = true;
    window.dots.api
      .defaultWorkspaceFor(name)
      .then((p) => {
        if (active) setWorkspacePath(p);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [name]);

  if (!showNewDotModal) return null;

  const handleSelectTemplate = (tpl: Template) => {
    setSelectedTemplate(tpl.id);
    setName(tpl.name);
    setDescription(tpl.description);
    setEmoji(tpl.emoji);
    setColor(tpl.color);
    setInstructions(tpl.instructions);
    setFiles(tpl.files);
    setShell(tpl.shell);
    setWeb(tpl.web);
  };

  const handlePickFolder = async () => {
    try {
      const chosen = await window.dots.api.pickFolder(workspacePath);
      if (chosen) setWorkspacePath(chosen);
    } catch (err: any) {
      showToast(err.message || 'Failed to select folder', 'error');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast('Give your Dot a name', 'error');
      return;
    }

    try {
      setCreating(true);
      const input: DotInput = {
        name: name.trim(),
        description: description.trim(),
        emoji,
        color,
        instructions: instructions.trim(),
        workspacePath: workspacePath.trim() || undefined,
        providerId,
        model: 'auto',
        notify: true,
        permissions: {
          files,
          shell,
          web,
          outsideWorkspace: false,
          approval: 'never'
        }
      };

      const dot = await window.dots.api.createDot(input);
      showToast(`Created Dot "${dot.name}"`, 'success');
      await refreshBootstrap();
      setActiveDotId(dot.id);
      setShowNewDotModal(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to create Dot', 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowNewDotModal(false)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        {/* Modal Header */}
        <div
          style={{
            padding: '1.15rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Create New Dot</h3>
          </div>

          <button className="btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setShowNewDotModal(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Templates Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.785rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Choose a Template:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: `1.5px solid ${selectedTemplate === tpl.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    background: selectedTemplate === tpl.id ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-input)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{tpl.emoji}</span>
                    <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>{tpl.name}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.3 }}>
                    {tpl.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Identity Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Icon
              </label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                style={{ width: '100%', textAlign: 'center', fontSize: '1.25rem', padding: '0.35rem 0' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Dot Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dot Name"
                style={{ width: '100%', fontWeight: 600 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Description / Role
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this Dot specializes in"
              style={{ width: '100%' }}
            />
          </div>

          {/* Model Provider */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Model Provider
            </label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              style={{ width: '100%' }}
            >
              {providerOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} {!opt.available ? `(${opt.reason})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Workspace Path */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Workspace Folder
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              />
              <button className="btn-secondary" onClick={handlePickFolder} style={{ fontSize: '0.8rem' }}>
                Browse...
              </button>
            </div>
          </div>

          {/* Standing Instructions */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Standing Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              style={{ width: '100%', fontSize: '0.8rem', lineHeight: 1.4 }}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            background: 'var(--bg-card)'
          }}
        >
          <button className="btn-ghost" onClick={() => setShowNewDotModal(false)} disabled={creating}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={creating || !name.trim()}>
            <Plus size={14} /> Create Dot
          </button>
        </div>
      </div>
    </div>
  );
};
