import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Eye, FileCode, FolderOpen, Link, Monitor, Paperclip, RefreshCw, Search, Smartphone, Terminal, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { localPreviewUrl } from '@shared/coding';
import './CodingWorkspace.css';

type WorkspaceFile = { path: string; size: number; isDir: boolean; mtime: number };

export function CodingWorkspace({ dotId, onAttach }: { dotId: string; onAttach: (path: string) => void }) {
  const { activeDot, activeRunEvents, selectedRunId, showToast } = useApp();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'code' | 'preview'>('code');
  const [url, setUrl] = useState('');
  const [devUrl, setDevUrl] = useState('');
  const [usingDevServer, setUsingDevServer] = useState(false);
  const [connect, setConnect] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [revision, setRevision] = useState(0);
  const [changedOnly, setChangedOnly] = useState(false);
  const fileRequest = useRef(0);
  const root = activeDot?.workspacePath ?? '';
  const relativeFile = (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const workspace = root.replace(/\\/g, '/').replace(/\/$/, '');
    return normalized.toLowerCase().startsWith(workspace.toLowerCase() + '/') ? normalized.slice(workspace.length + 1) : normalized;
  };
  const changed = new Set(activeRunEvents.filter(event => event.type === 'file').map(event => event.type === 'file' ? relativeFile(event.path).toLowerCase() : ''));
  const fileStamp = activeRunEvents.filter(event => event.type === 'file').map(event => event.seq).join(',');
  const latestTools = useMemo(() => {
    const tools = new Map<string, Extract<(typeof activeRunEvents)[number], { type: 'tool' }>>();
    for (const event of activeRunEvents) if (event.type === 'tool' && event.category === 'shell') tools.set(event.id, event);
    return [...tools.values()].slice(-5);
  }, [activeRunEvents]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      window.dots.api.listWorkspaceFiles(dotId).then(result => {
        if (!alive) return;
        const next = result.filter(file => !file.isDir).sort((a, b) => a.path.localeCompare(b.path));
        setFiles(next);
        setSelected(current => current || next.find(file => /(^|[\\/])index\.html?$/i.test(file.path))?.path || next[0]?.path || '');
        setRevision(value => value + 1);
      }).catch(reason => { if (alive) setError(reason.message); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [dotId, fileStamp, selectedRunId]);

  const refresh = async () => {
    try {
      const next = await window.dots.api.listWorkspaceFiles(dotId);
      setFiles(next.filter(file => !file.isDir).sort((a, b) => a.path.localeCompare(b.path)));
      setRevision(value => value + 1);
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Could not refresh files', 'error'); }
  };

  useEffect(() => {
    const request = ++fileRequest.current;
    setError(''); setContent('');
    if (!selected) { setLoading(false); return; }
    setLoading(true);
    window.dots.api.readWorkspaceFile(dotId, selected).then(result => {
      if (request === fileRequest.current) setContent(result.content);
    }).catch(reason => { if (request === fileRequest.current) setError(reason.message); })
      .finally(() => { if (request === fileRequest.current) setLoading(false); });
    return () => { fileRequest.current++; };
  }, [dotId, selected, revision]);

  useEffect(() => {
    if (mode !== 'preview' || usingDevServer || !/\.html?$/i.test(selected)) return;
    let alive = true;
    setUrl('');
    window.dots.api.startWorkspacePreview(dotId, selected).then(result => { if (alive) setUrl(result.url); })
      .catch(reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [dotId, selected, mode, usingDevServer, revision]);

  const visible = files.filter(file => file.path.toLowerCase().includes(query.toLowerCase()) && (!changedOnly || changed.has(relativeFile(file.path).toLowerCase())));
  const lines = content.split('\n');
  const staticReady = /\.html?$/i.test(selected);
  return <aside className="coding-workspace" aria-label="Coding workspace">
    <header className="build-heading"><div><Code2 size={17} /><strong>Your project</strong></div><div>
      <button className="icon-button" aria-label="Refresh project" onClick={() => void refresh()}><RefreshCw size={15} /></button>
      <button className="icon-button" aria-label="Open project folder" onClick={() => window.dots.api.openPath(root).catch(reason => showToast(reason.message, 'error'))}><FolderOpen size={16} /></button>
    </div></header>
    <div className="build-surface">
      <nav className="build-files" aria-label="Project files">
        <label className="build-search"><Search size={13} /><input aria-label="Search project files" placeholder="Find a file…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="build-file-filters"><button aria-pressed={!changedOnly} onClick={() => setChangedOnly(false)}>All files</button><button aria-pressed={changedOnly} onClick={() => setChangedOnly(true)}>Changed {changed.size || ''}</button></div>
        <div className="build-file-list">{visible.map(file => <button key={file.path} aria-pressed={selected === file.path} title={file.path} onClick={() => { setSelected(file.path); if (!usingDevServer && !/\.html?$/i.test(file.path)) setMode('code'); }}><FileCode size={13} /><span>{file.path.replace(/\\/g, '/')}</span>{changed.has(relativeFile(file.path).toLowerCase()) && <i aria-label="Changed file" />}</button>)}</div>
        {!visible.length && <p className="build-empty-files">{files.length ? 'No matching files.' : 'Files appear here as your Dot builds.'}</p>}
        {files.length >= 900 && <small>Showing up to 1,000 entries. Open the folder for the full project.</small>}
      </nav>
      <section className="build-viewer">
        <div className="build-view-tabs"><div><button aria-pressed={mode === 'code'} onClick={() => setMode('code')}><Code2 size={14} />Code</button><button aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}><Eye size={14} />Preview</button></div>
          {selected && <button className="icon-button" aria-label="Reference selected file" title="Add this file to your message" onClick={() => onAttach(selected)}><Paperclip size={14} /></button>}
        </div>
        <div className="build-file-path" title={mode === 'preview' && usingDevServer ? url : selected}>{mode === 'preview' && usingDevServer ? url : selected || 'No file selected'}{mode === 'code' && selected && <small>{lines.length} lines · read only</small>}</div>
        {mode === 'code' ? <div className="build-code" tabIndex={0} aria-label="File contents">
          {loading ? <p>Reading file…</p> : error ? <p role="status">{error}</p> : selected ? <pre><span className="build-line-numbers" aria-hidden="true">{lines.map((_, index) => index + 1).join('\n')}</span><code>{content}</code></pre> : <div className="build-empty"><FileCode size={28} /><h3>From an idea to a working app</h3><p>Describe what you want in the conversation. Inspect the files here as your Dot works.</p></div>}
        </div> : <>
          <div className="build-preview-tools"><div><button aria-pressed={!mobile} aria-label="Desktop preview" onClick={() => setMobile(false)}><Monitor size={14} /></button><button aria-pressed={mobile} aria-label="Mobile preview" onClick={() => setMobile(true)}><Smartphone size={14} /></button><button aria-label="Reload preview" onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} /></button></div><button onClick={() => setConnect(value => !value)}><Link size={13} />Dev server</button></div>
          {connect && <form className="build-connect" onSubmit={event => { event.preventDefault(); try { setUrl(localPreviewUrl(devUrl)); setUsingDevServer(true); setConnect(false); setError(''); } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Invalid local URL', 'error'); } }}><input aria-label="Local dev server URL" placeholder="http://localhost:5173" value={devUrl} onChange={event => setDevUrl(event.target.value)} /><button className="btn-secondary" type="submit">Connect</button></form>}
          {usingDevServer && <div className="build-preview-note">Local dev server · must already be running<button aria-label="Disconnect dev server" onClick={() => { setUsingDevServer(false); setUrl(''); }}><X size={12} /></button></div>}
          <div className={`build-preview ${mobile ? 'is-mobile' : ''}`}>
            {url && (staticReady || usingDevServer) ? <iframe key={`${url}:${revision}`} src={url} title="App preview" sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" /> : <div className="build-empty"><Eye size={28} /><h3>{error ? 'Preview unavailable' : 'See what you’re building'}</h3><p>{error || (staticReady ? 'Starting preview…' : 'Select an HTML file for a live static preview. For a framework app, start its dev server and connect the local URL above.')}</p></div>}
          </div>
        </>}
      </section>
    </div>
    <section className="build-checks" aria-label="Commands and checks"><div className="build-check-heading"><Terminal size={13} /><strong>Commands & checks</strong><span>{selectedRunId ? 'This turn' : 'No run selected'}</span></div>
      {latestTools.length ? latestTools.map(tool => <details key={tool.id}><summary><i className={`build-check-${tool.status}`} /> <span>{tool.input || tool.name}</span><small>{tool.status === 'ok' ? 'Ran successfully' : tool.status === 'error' ? 'Failed' : 'Running'}</small></summary><pre>{tool.output || 'Waiting for output…'}</pre></details>) : <p>Actual command results appear here when your Dot runs them.</p>}
    </section>
  </aside>;
}
