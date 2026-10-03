import React, { useState, useEffect } from 'react';
import {
  Save,
  Trash2,
  RotateCcw,
  Folder,
  Shield,
  Clock,
  Cpu,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { DotPatch, FileAccess, ModelInfo, ProviderOption } from '@shared/types';
import { CODEX_PROVIDER_ID } from '@shared/types';

interface DotSettingsProps {
  dotId: string;
}

export const DotSettings: React.FC<DotSettingsProps> = ({ dotId }) => {
  const { activeDot, providerOptions, showToast, refreshBootstrap } = useApp();

  const [name, setName] = useState(activeDot?.name ?? '');
  const [description, setDescription] = useState(activeDot?.description ?? '');
  const [emoji, setEmoji] = useState(activeDot?.emoji ?? '🤖');
  const [color, setColor] = useState(activeDot?.color ?? '#6366f1');
  const [instructions, setInstructions] = useState(activeDot?.instructions ?? '');
  const [workspacePath, setWorkspacePath] = useState(activeDot?.workspacePath ?? '');
  const [providerId, setProviderId] = useState(activeDot?.providerId ?? CODEX_PROVIDER_ID);
  const [model, setModel] = useState(activeDot?.model ?? 'auto');
  const [reasoningEffort, setReasoningEffort] = useState(activeDot?.reasoningEffort ?? 'low');

  const [files, setFiles] = useState<FileAccess>(activeDot?.permissions.files ?? 'write');
  const [shell, setShell] = useState(activeDot?.permissions.shell ?? true);
  const [web, setWeb] = useState(activeDot?.permissions.web ?? true);
  const [outsideWorkspace, setOutsideWorkspace] = useState(activeDot?.permissions.outsideWorkspace ?? false);
  const [approval, setApproval] = useState<'never' | 'ask'>(activeDot?.permissions.approval ?? 'never');

  const [maxMinutes, setMaxMinutes] = useState(activeDot?.budget.maxMinutes ?? 30);
  const [maxSteps, setMaxSteps] = useState(activeDot?.budget.maxSteps ?? 60);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync state if activeDot changes
  useEffect(() => {
    if (!activeDot) return;
    setName(activeDot.name);
    setDescription(activeDot.description);
    setEmoji(activeDot.emoji);
    setColor(activeDot.color);
    setInstructions(activeDot.instructions);
    setWorkspacePath(activeDot.workspacePath);
    setProviderId(activeDot.providerId);
    setModel(activeDot.model);
    setReasoningEffort(activeDot.reasoningEffort ?? 'low');
    setFiles(activeDot.permissions.files);
    setShell(activeDot.permissions.shell);
    setWeb(activeDot.permissions.web);
    setOutsideWorkspace(activeDot.permissions.outsideWorkspace);
    setApproval(activeDot.permissions.approval);
    setMaxMinutes(activeDot.budget.maxMinutes);
    setMaxSteps(activeDot.budget.maxSteps);
  }, [activeDot]);

  // Load models for current provider
  useEffect(() => {
    let active = true;
    setLoadingModels(true);
    window.dots.api
      .listModels(providerId)
      .then((res) => {
        if (active) setModels(res);
      })
      .catch((err) => {
        console.error('Failed to list models', err);
      })
      .finally(() => {
        if (active) setLoadingModels(false);
      });
    return () => {
      active = false;
    };
  }, [providerId]);

  const handlePickFolder = async () => {
    try {
      const chosen = await window.dots.api.pickFolder(workspacePath);
      if (chosen) setWorkspacePath(chosen);
    } catch (err: any) {
      showToast(err.message || 'Failed to select folder', 'error');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const patch: DotPatch = {
        name: name.trim(),
        description: description.trim(),
        emoji,
        color,
        instructions,
        workspacePath: workspacePath.trim(),
        providerId,
        model,
        reasoningEffort,
        permissions: {
          files,
          shell,
          web,
          outsideWorkspace,
          approval
        },
        budget: {
          maxMinutes: Math.max(1, Number(maxMinutes) || 30),
          maxSteps: Math.max(1, Number(maxSteps) || 60)
        }
      };

      await window.dots.api.updateDot(dotId, patch);
      showToast('Settings saved successfully', 'success');
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSession = async () => {
    if (!confirm(`Reset the conversation thread for "${activeDot?.name}"? Memory and workspace files will not be touched.`)) return;
    try {
      await window.dots.api.resetDotSession(dotId);
      showToast('Conversation session reset', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to reset session', 'error');
    }
  };

  const handleDeleteDot = async () => {
    const deleteFolder = confirm(`Also delete the workspace folder on disk? (${workspacePath})`);
    if (!confirm(`Are you sure you want to permanently delete "${activeDot?.name}"?`)) return;
    try {
      await window.dots.api.deleteDot(dotId, deleteFolder);
      showToast('Dot deleted', 'info');
      await refreshBootstrap();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete Dot', 'error');
    }
  };

  const PRESET_EMOJIS = ['🤖', '💻', '🔍', '⚙️', '📝', '⚡', '🧪', '🛡️', '📊', '🎨', '🚀', '🧠'];
  const PRESET_COLORS = ['#6366f1', '#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#14b8a6', '#ef4444'];

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sliders size={18} style={{ color: 'var(--accent-primary)' }} /> Dot Configuration
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Manage identity, model provider, workspace, permissions and runtime budgets.
          </p>
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: '0.825rem' }}>
          <Save size={14} /> Save Changes
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Section 1: Identity */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>
            Agent Identity
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Icon & Color
              </label>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--radius-full)',
                  background: `${color}22`,
                  border: `2px solid ${color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.6rem'
                }}
              >
                {emoji}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Dot Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', fontSize: '0.95rem', fontWeight: 600 }}
              />
            </div>
          </div>

          {/* Quick Emoji & Color Pickers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {PRESET_EMOJIS.map((e) => (
                <button
                  key={e}
                  className="btn-ghost"
                  style={{
                    fontSize: '1.1rem',
                    padding: '0.2rem 0.4rem',
                    background: emoji === e ? 'var(--bg-card-hover)' : 'transparent',
                    border: `1px solid ${emoji === e ? 'var(--border-focus)' : 'transparent'}`
                  }}
                  onClick={() => setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              {PRESET_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: 'var(--radius-full)',
                    background: c,
                    cursor: 'pointer',
                    border: `2px solid ${color === c ? '#ffffff' : 'transparent'}`,
                    boxShadow: color === c ? '0 0 6px rgba(255,255,255,0.6)' : 'none'
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Short Description / Role
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Senior Full-Stack Engineer working on our API"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Standing Instructions (System Prompt)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Instructions that always guide this Dot (e.g. 'Use modern TypeScript, write unit tests, verify changes before answering')."
              rows={4}
              style={{ width: '100%', fontSize: '0.825rem', lineHeight: 1.45 }}
            />
          </div>
        </div>

        {/* Section 2: Model & Provider */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Cpu size={16} /> Model & Intelligence
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Provider
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

            <div>
              <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Model {loadingModels ? '(Loading...)' : ''}
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="auto">Automatic (Recommended)</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} {m.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Reasoning Depth
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['low', 'medium', 'high', 'max'].map((r) => (
                <button
                  key={r}
                  className={reasoningEffort === r ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', textTransform: 'capitalize' }}
                  onClick={() => setReasoningEffort(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Workspace */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Folder size={16} /> Workspace Directory
          </div>
          <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            The dedicated folder on this computer where {activeDot?.name} writes code, reads files, and runs tools.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}
            />
            <button className="btn-secondary" onClick={handlePickFolder}>
              Browse...
            </button>
          </div>
        </div>

        {/* Section 4: Permissions */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Shield size={16} /> Permissions & Guardrails
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>Workspace File Access</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow Dot to modify files or keep it strictly read-only.</div>
              </div>
              <select
                value={files}
                onChange={(e) => setFiles(e.target.value as FileAccess)}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
              >
                <option value="write">Read & Write</option>
                <option value="read">Read-Only</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>Shell Command Execution</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow running commands (compilers, git, npm, python).</div>
              </div>
              <input type="checkbox" checked={shell} onChange={(e) => setShell(e.target.checked)} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>Web Search & Browsing</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow querying DuckDuckGo, fetching docs, and web access.</div>
              </div>
              <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>Human Approval Policy</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ask for your confirmation before running shell or write actions.</div>
              </div>
              <select
                value={approval}
                onChange={(e) => setApproval(e.target.value as 'never' | 'ask')}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
              >
                <option value="never">Autonomous (Never Ask)</option>
                <option value="ask">Ask Confirmation</option>
              </select>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--border-subtle)'
              }}
            >
              <div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <AlertTriangle size={13} /> Allow Access Outside Workspace
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Disables workspace sandboxing. Only enable for trusted tasks.</div>
              </div>
              <input type="checkbox" checked={outsideWorkspace} onChange={(e) => setOutsideWorkspace(e.target.checked)} />
            </div>
          </div>
        </div>

        {/* Section 5: Budget */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Clock size={16} /> Execution Budgets
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Max Run Duration (Minutes)
              </label>
              <input
                type="number"
                min="1"
                max="720"
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.785rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Max Tool Steps per Task
              </label>
              <input
                type="number"
                min="5"
                max="500"
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Section 6: Maintenance & Danger Zone */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
            Danger Zone
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>Reset Session Thread</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Clears the chat conversation history without affecting memory or files.</div>
            </div>
            <button className="btn-secondary" onClick={handleResetSession} style={{ fontSize: '0.8rem' }}>
              <RotateCcw size={13} /> Reset Thread
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.85rem' }}>
            <div>
              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--accent-danger)' }}>Delete Dot</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Permanently removes this Dot from the app.</div>
            </div>
            <button className="btn-danger" onClick={handleDeleteDot} style={{ fontSize: '0.8rem' }}>
              <Trash2 size={13} /> Delete Dot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
