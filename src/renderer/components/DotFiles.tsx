import React, { useState, useEffect } from 'react';
import { Folder, File, FolderOpen, RefreshCw, Search, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface DotFilesProps {
  dotId: string;
}

export const DotFiles: React.FC<DotFilesProps> = ({ dotId }) => {
  const { activeDot, showToast } = useApp();
  const [files, setFiles] = useState<{ path: string; size: number; isDir: boolean; mtime: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadFiles = async () => {
    try {
      setLoading(true);
      const list = await window.dots.api.listWorkspaceFiles(dotId);
      setFiles(list);
    } catch (err: any) {
      showToast(err.message || 'Failed to list files', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [dotId]);

  const handleOpenFolder = async () => {
    if (!activeDot?.workspacePath) return;
    try {
      await window.dots.api.openPath(activeDot.workspacePath);
    } catch (err: any) {
      showToast(err.message || 'Failed to open folder', 'error');
    }
  };

  const handleOpenFile = async (relPath: string) => {
    if (!activeDot?.workspacePath) return;
    try {
      const full = activeDot.workspacePath.replace(/\\/g, '/') + '/' + relPath.replace(/^\.?\//, '');
      await window.dots.api.openPath(full);
    } catch (err: any) {
      showToast(err.message || 'Failed to open file', 'error');
    }
  };

  const filtered = files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()));

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', maxWidth: '840px', margin: '0 auto', width: '100%' }}>
      {/* Workspace Header */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Workspace Directory
          </div>
          <div
            style={{
              fontSize: '0.875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-main)',
              marginTop: '0.2rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={activeDot?.workspacePath}
          >
            {activeDot?.workspacePath}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={loadFiles} disabled={loading} style={{ fontSize: '0.8rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn-primary" onClick={handleOpenFolder} style={{ fontSize: '0.8rem' }}>
            <FolderOpen size={14} /> Open Folder
          </button>
        </div>
      </div>

      {/* Search / Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Search workspace files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: '2.1rem' }}
          />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', flexShrink: 0 }}>
          {files.length} item{files.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Files Table */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden'
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            {files.length === 0 ? 'Workspace is currently empty.' : 'No files match your search.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((item, i) => (
              <div
                key={i}
                onClick={() => !item.isDir && handleOpenFile(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 1rem',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  fontSize: '0.825rem',
                  cursor: !item.isDir ? 'pointer' : 'default',
                  transition: 'background var(--transition-fast)'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title={!item.isDir ? `Click to open ${item.path}` : item.path}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                  {item.isDir ? (
                    <Folder size={15} style={{ color: '#818cf8', flexShrink: 0 }} />
                  ) : (
                    <File size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.path}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-dim)', fontSize: '0.75rem', flexShrink: 0 }}>
                  <span>{!item.isDir ? formatSize(item.size) : 'Folder'}</span>
                  <span>{new Date(item.mtime).toLocaleDateString()}</span>
                  {!item.isDir && <ExternalLink size={13} style={{ color: '#818cf8', opacity: 0.8 }} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
