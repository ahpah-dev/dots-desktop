import React from 'react';
import {
  MessageSquare,
  Brain,
  Folder,
  Clock,
  Settings as SettingsIcon,
  Play,
  Pause,
  FolderOpen,
  Cpu
} from 'lucide-react';
import { useApp, type TabType } from '../context/AppContext';
import { RunTimeline } from './RunTimeline';
import { RunHistory } from './RunHistory';
import { DotMemory } from './DotMemory';
import { DotFiles } from './DotFiles';
import { DotSchedule } from './DotSchedule';
import { DotSettings } from './DotSettings';

export const DotView: React.FC = () => {
  const { activeDot, activeTab, setActiveTab, showToast } = useApp();

  if (!activeDot) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)',
          padding: '2rem'
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✨</div>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          Select or Create a Dot
        </div>
        <div style={{ fontSize: '0.825rem' }}>
          Select a Dot from the sidebar to view its tasks, memory, files, and schedules.
        </div>
      </div>
    );
  }

  const togglePause = async () => {
    try {
      await window.dots.api.setDotPaused(activeDot.id, !activeDot.paused);
      showToast(activeDot.paused ? `Resumed "${activeDot.name}"` : `Paused "${activeDot.name}"`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle pause', 'error');
    }
  };

  const handleOpenFolder = async () => {
    try {
      await window.dots.api.openPath(activeDot.workspacePath);
    } catch (err: any) {
      showToast(err.message || 'Failed to open workspace folder', 'error');
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'tasks', label: 'Tasks & Activity', icon: <MessageSquare size={14} /> },
    { id: 'memory', label: 'Memory', icon: <Brain size={14} /> },
    { id: 'files', label: 'Files', icon: <Folder size={14} /> },
    { id: 'schedule', label: 'Schedule', icon: <Clock size={14} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={14} /> }
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top Header Bar */}
      <div
        style={{
          padding: '1rem 1.25rem 0.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}
      >
        {/* Main Title Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-full)',
                background: `${activeDot.color}22`,
                border: `2px solid ${activeDot.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                flexShrink: 0
              }}
            >
              {activeDot.emoji}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeDot.name}
                </h1>
                <span className={`pill pill-${activeDot.status}`} style={{ fontSize: '0.7rem' }}>
                  {activeDot.status === 'running' && <span className="spin">◓</span>}
                  {activeDot.status}
                </span>
              </div>

              <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '600px' }}>
                {activeDot.description || 'Autonomous Dot agent'}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <button
              className="btn-secondary"
              style={{ fontSize: '0.785rem', padding: '0.35rem 0.65rem' }}
              onClick={handleOpenFolder}
              title="Open workspace directory in file explorer"
            >
              <FolderOpen size={13} /> Open Folder
            </button>

            <button
              className={activeDot.paused ? 'btn-primary' : 'btn-secondary'}
              style={{ fontSize: '0.785rem', padding: '0.35rem 0.65rem' }}
              onClick={togglePause}
            >
              {activeDot.paused ? <Play size={13} /> : <Pause size={13} />}
              {activeDot.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="btn-ghost"
                style={{
                  fontSize: '0.825rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  borderBottom: `2px solid ${isActive ? 'var(--accent-primary)' : 'transparent'}`,
                  color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'tasks' && (
          <>
            <RunTimeline dotId={activeDot.id} />
            <RunHistory />
          </>
        )}
        {activeTab === 'memory' && <DotMemory dotId={activeDot.id} />}
        {activeTab === 'files' && <DotFiles dotId={activeDot.id} />}
        {activeTab === 'schedule' && <DotSchedule dotId={activeDot.id} />}
        {activeTab === 'settings' && <DotSettings dotId={activeDot.id} />}
      </div>
    </div>
  );
};
