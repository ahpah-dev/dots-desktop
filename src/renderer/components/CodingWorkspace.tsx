import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Copy, Eye, FileCode, FolderOpen, Link, Monitor, Paperclip, RefreshCw, Search, Smartphone, Terminal, X } from 'lucide-react';
import { useApp, useRunEvents } from '../context/AppContext';
import { localPreviewUrl } from '@shared/coding';
import { ProjectFileList, ProjectSource } from './ProjectSource';
import './CodingWorkspace.css';

type WorkspaceFile = { path: string; size: number; isDir: boolean; mtime: number };

export function CodingWorkspace({ dotId, onAttach }: { dotId: string; onAttach: (path: string) => void }) {
  const { activeDot, runs, selectedRunId, showToast } = useApp();
  const activeRunEvents = useRunEvents();
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
  const [readRevision, setReadRevision] = useState(0);
  const [changedOnly, setChangedOnly] = useState(false);
  const fileRequest = useRef(0);
  const fileSignature = useRef('');
  const listRequest = useRef(0);
  const loadedPath = useRef('');
  const previewPath = useRef('');
  const root = activeDot?.workspacePath ?? '';
  const relativeFile = useCallback((path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const workspace = root.replace(/\\/g, '/').replace(/\/$/, '');
    return normalized.toLowerCase().startsWith(workspace.toLowerCase() + '/') ? normalized.slice(workspace.length + 1) : normalized;
  }, [root]);
  const { changed, fileStamp } = useMemo(() => {
    const events = activeRunEvents.filter(event => event.type === 'file');
    return { changed: new Set(events.map(event => event.type === 'file' ? relativeFile(event.path).toLowerCase() : '')), fileStamp: events.map(event => event.seq).join(',') };
  }, [activeRunEvents, relativeFile]);
  const selectedStatus = runs.find(run => run.id === selectedRunId)?.status;
  const latestTools = useMemo(() => {
    const tools = new Map<string, Extract<(typeof activeRunEvents)[number], { type: 'tool' }>>();
    for (const event of activeRunEvents) if (event.type === 'tool' && event.category === 'shell') tools.set(event.id, event);
    return [...tools.values()].slice(-5);
  }, [activeRunEvents]);

  const loadFiles = useCallback(async (force = false) => {
    const request = ++listRequest.current;
    try {
      const result = await window.dots.api.listWorkspaceFiles(dotId, { refresh: force });
      if (request === listRequest.current) {
        const next = result.filter(file => !file.isDir).sort((a, b) => a.path.localeCompare(b.path));
        const signature = next.map(file => `${file.path}:${file.size}:${file.mtime}`).join('|');
        if (signature !== fileSignature.current) { fileSignature.current = signature; setFiles(next); setRevision(value => value + 1); }
        setSelected(current => next.some(file => file.path === current) ? current : next.find(file => /(^|[\\/])index\.html?$/i.test(file.path))?.path || next[0]?.path || '');
      }
    } catch (reason) { if (request === listRequest.current) setError(reason instanceof Error ? reason.message : 'Could not load files'); }
  }, [dotId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadFiles(), 180);
    return () => clearTimeout(timer);
  }, [loadFiles, fileStamp, selectedRunId, selectedStatus]);
  useEffect(() => () => { listRequest.current++; }, []);

  const refresh = async () => {
    try {
      await loadFiles(true);
      setReadRevision(value => value + 1);
      setRevision(value => value + 1);
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Could not refresh files', 'error'); }
  };
  const selectedMtime = files.find(file => file.path === selected)?.mtime;

  useEffect(() => {
    const request = ++fileRequest.current;
    if (mode !== 'code') return;
    setError('');
    if (loadedPath.current !== selected) setContent('');
    if (!selected) { setLoading(false); return; }
    setLoading(true);
    window.dots.api.readWorkspaceFile(dotId, selected).then(result => {
      if (request === fileRequest.current) { loadedPath.current = selected; setContent(result.content); }
    }).catch(reason => { if (request === fileRequest.current) setError(reason.message); })
      .finally(() => { if (request === fileRequest.current) setLoading(false); });
    return () => { fileRequest.current++; };
  }, [dotId, selected, selectedMtime, readRevision, mode]);

  useEffect(() => {
    if (mode !== 'preview' || usingDevServer || !/\.html?$/i.test(selected)) return;
    let alive = true;
    setError('');
    if (previewPath.current !== selected) { previewPath.current = selected; setUrl(''); }
    window.dots.api.startWorkspacePreview(dotId, selected).then(result => { if (alive) setUrl(result.url); })
      .catch(reason => { if (alive) setError(reason.message); });
    return () => { alive = false; };
  }, [dotId, selected, mode, usingDevServer, revision]);

  const deferredQuery = useDeferredValue(query);
  const visible = useMemo(() => files.filter(file => file.path.toLowerCase().includes(deferredQuery.toLowerCase()) && (!changedOnly || changed.has(relativeFile(file.path).toLowerCase()))), [files, deferredQuery, changedOnly, changed, relativeFile]);
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const selectFile = useCallback((path: string) => { setSelected(path); if (!usingDevServer && !/\.html?$/i.test(path)) setMode('code'); }, [usingDevServer]);
  const staticReady = /\.html?$/i.test(selected);
  return <aside className="coding-workspace" id={`project-panel-${dotId}`} aria-label="Coding workspace">
    <header className="build-heading"><div><Code2 size={17} /><strong>Your project</strong></div><div>
      <button className="icon-button" aria-label="Refresh project" onClick={() => void refresh()}><RefreshCw size={15} /></button>
      <button className="icon-button" aria-label="Open project folder" onClick={() => window.dots.api.openPath(root).catch(reason => showToast(reason.message, 'error'))}><FolderOpen size={16} /></button>
    </div></header>
    <div className="build-surface">
      <nav className="build-files" aria-label="Project files">
        <label className="build-search"><Search size={13} /><input aria-label="Search project files" placeholder="Find a file…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className="build-file-filters"><button aria-pressed={!changedOnly} onClick={() => setChangedOnly(false)}>All files</button><button aria-pressed={changedOnly} onClick={() => setChangedOnly(true)}>Changed {changed.size || ''}</button></div>
        <ProjectFileList files={visible} selected={selected} changed={changed} onSelect={selectFile} />
        {!visible.length && <p className="build-empty-files">{files.length ? 'No matching files.' : 'Files appear here as your Dot builds.'}</p>}
        {files.length >= 900 && <small>Showing up to 1,000 entries. Open the folder for the full project.</small>}
      </nav>
      <section className="build-viewer">
        <div className="build-view-tabs"><div><button aria-pressed={mode === 'code'} onClick={() => setMode('code')}><Code2 size={14} />Code</button><button aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}><Eye size={14} />Preview</button></div>
          <div>{mode === 'code' && selected && !error && <button className="icon-button" aria-label="Copy file contents" title="Copy the entire file" disabled={loading || loadedPath.current !== selected} onClick={() => window.dots.api.writeClipboardText(content).then(() => showToast('File copied')).catch(() => showToast('Could not copy this file', 'error'))}><Copy size={14} /></button>}{selected && <button className="icon-button" aria-label="Reference selected file" title="Add this file to your message" onClick={() => onAttach(selected)}><Paperclip size={14} /></button>}</div>
        </div>
        <div className="build-file-path" title={mode === 'preview' && usingDevServer ? url : selected}>{mode === 'preview' && usingDevServer ? url : selected || 'No file selected'}{mode === 'code' && selected && <small>{loading ? 'Reading…' : `${lineCount} lines · read only`}</small>}</div>
        {mode === 'code' ? error ? <div className="build-code"><p role="status">{error}</p></div> : selected && content ? <ProjectSource content={content} path={selected} /> : <div className="build-empty"><FileCode size={28} /><h3>{loading ? 'Reading file…' : selected ? 'Empty file' : 'From an idea to a working app'}</h3><p>{selected ? 'Your file contents appear here.' : 'Describe what you want in the conversation. Inspect the files here as your Dot works.'}</p></div> : <>
          <div className="build-preview-tools"><div><button aria-pressed={!mobile} aria-label="Desktop preview" onClick={() => setMobile(false)}><Monitor size={14} /></button><button aria-pressed={mobile} aria-label="Mobile preview" onClick={() => setMobile(true)}><Smartphone size={14} /></button><button aria-label="Reload preview" onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} /></button></div><button onClick={() => setConnect(value => !value)}><Link size={13} />Dev server</button></div>
          {connect && <form className="build-connect" onSubmit={event => { event.preventDefault(); try { setUrl(localPreviewUrl(devUrl)); setUsingDevServer(true); setConnect(false); setError(''); } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Invalid local URL', 'error'); } }}><input aria-label="Local dev server URL" placeholder="http://localhost:5173" value={devUrl} onChange={event => setDevUrl(event.target.value)} /><button className="btn-secondary" type="submit">Connect</button></form>}
          {usingDevServer && <div className="build-preview-note">Local dev server · must already be running<button aria-label="Disconnect dev server" onClick={() => { setUsingDevServer(false); setUrl(''); }}><X size={12} /></button></div>}
          {error && url && <div className="build-preview-note" role="status">{error}</div>}
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
