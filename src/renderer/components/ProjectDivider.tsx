import { useEffect, useRef, useState } from 'react';

const clamp = (value: number) => Math.max(32, Math.min(68, value));
export function ProjectDivider({ dotId }: { dotId: string }) {
  const [width, setWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem(`dots:project-width:${dotId}`)); return saved ? clamp(saved) : 40; } catch { return 40; }
  });
  const ref = useRef<HTMLDivElement>(null), next = useRef(width), frame = useRef(0);
  const apply = (value: number) => {
    next.current = clamp(value);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      ref.current?.parentElement?.style.setProperty('--conversation-width', `${next.current}%`);
      setWidth(next.current);
    });
  };
  const save = () => { try { localStorage.setItem(`dots:project-width:${dotId}`, String(next.current)); } catch { /* Sizing remains available. */ } };
  useEffect(() => {
    const parent = ref.current?.parentElement;
    parent?.style.setProperty('--conversation-width', `${width}%`);
    return () => { cancelAnimationFrame(frame.current); parent?.style.removeProperty('--conversation-width'); };
  }, [dotId]);
  return <div ref={ref} className="project-resize-handle" role="separator" tabIndex={0} aria-label="Resize project panel" aria-orientation="vertical" aria-valuemin={32} aria-valuemax={68} aria-valuenow={Math.round(width)}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
    onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); apply((event.clientX - rect.left) / rect.width * 100); }}
    onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); save(); }}
    onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); apply(event.key === 'Home' ? 32 : event.key === 'End' ? 68 : next.current + (event.key === 'ArrowLeft' ? -2 : 2)); save(); }} />;
}
