import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileCode } from 'lucide-react';

function useRows(count: number, rowHeight: number) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [view, setView] = useState({ first: 0, height: 320 });
  const update = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const node = ref.current;
      if (!node) return;
      const first = Math.floor(node.scrollTop / rowHeight), height = node.clientHeight;
      setView(current => current.first === first && current.height === height ? current : { first, height });
    });
  }, [rowHeight]);
  useEffect(() => {
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    update();
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [update]);
  const start = Math.max(0, Math.min(count - 1, view.first) - 6);
  const end = Math.min(count, start + Math.ceil(Math.max(120, view.height) / rowHeight) + 12);
  return { ref, onScroll: update, start, end };
}

export const ProjectSource = memo(function ProjectSource({ content, path }: { content: string; path: string }) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const width = useMemo(() => Math.min(100_000, lines.reduce((max, line) => Math.max(max, line.length), 0)) * 7.3 + 74, [lines]);
  const rows = useRows(lines.length, 22);
  useEffect(() => { if (rows.ref.current) { rows.ref.current.scrollTop = 0; rows.ref.current.scrollLeft = 0; rows.onScroll(); } }, [path]);
  return <div ref={rows.ref} onScroll={rows.onScroll} className="build-code build-virtual-source" tabIndex={0} aria-label={`File contents, ${lines.length} lines`}>
    <div className="build-source-canvas" style={{ height: lines.length * 22, minWidth: width }}>
      {lines.slice(rows.start, rows.end).map((line, offset) => <div className="build-source-line" key={rows.start + offset} style={{ top: (rows.start + offset) * 22 }}><span aria-hidden="true">{rows.start + offset + 1}</span><code>{line || ' '}</code></div>)}
    </div>
  </div>;
});

export const ProjectFileList = memo(function ProjectFileList({ files, selected, changed, onSelect }: {
  files: { path: string }[]; selected: string; changed: Set<string>; onSelect: (path: string) => void;
}) {
  const rows = useRows(files.length, 34);
  const id = useId();
  const selectedIndex = files.findIndex(file => file.path === selected);
  const activeId = selectedIndex >= rows.start && selectedIndex < rows.end ? `${id}-${selectedIndex}` : undefined;
  const move = (event: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !files.length) return;
    event.preventDefault();
    const current = files.findIndex(file => file.path === selected);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? files.length - 1 : Math.max(0, Math.min(files.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    onSelect(files[next].path);
    if (rows.ref.current) { rows.ref.current.scrollTop = Math.max(0, next * 34 - rows.ref.current.clientHeight / 2); rows.onScroll(); }
  };
  return <div className="build-file-list" ref={rows.ref} onScroll={rows.onScroll} onKeyDown={move} role="listbox" aria-label="Workspace files" aria-activedescendant={activeId} tabIndex={0}>
    <div style={{ height: files.length * 34, position: 'relative' }}>
      {files.slice(rows.start, rows.end).map((file, offset) => <button key={file.path} id={`${id}-${rows.start + offset}`} role="option" aria-selected={selected === file.path} aria-posinset={rows.start + offset + 1} aria-setsize={files.length} tabIndex={-1} title={file.path} onClick={() => { onSelect(file.path); rows.ref.current?.focus(); }} style={{ position: 'absolute', top: (rows.start + offset) * 34 }}><FileCode size={13} /><span>{file.path.replace(/\\/g, '/')}</span>{changed.has(file.path.replace(/\\/g, '/').toLowerCase()) && <i aria-label="Changed file" />}</button>)}
    </div>
  </div>;
});
