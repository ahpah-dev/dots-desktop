import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ChevronRight, GripHorizontal, Square, Volume2, VolumeX, X, Radio } from 'lucide-react';
import type { DesktopDotBridge, DesktopDotState, DesktopDotAction } from '@shared/activity';
import { DotAvatar } from './components/DotAvatar';
import { ActivityGlyph } from './components/ActivityGlyph';
import './widget.css';
declare global { interface Window { desktopDot: DesktopDotBridge; } }

function DesktopDotWidget() {
  const [state,setState]=useState<DesktopDotState|null>(null);
  const [error,setError]=useState('');
  const lastSpoken=useRef('');
  useEffect(()=> {
    let alive=true, pushed=false;
    const unsubscribe=window.desktopDot.onState(next=>{pushed=true;if(alive)setState(next);});
    void window.desktopDot.getState().then(next=>{if(alive&&!pushed)setState(next);}).catch(()=>{if(alive)setError('Open Dots to reconnect.');});
    return ()=>{alive=false;unsubscribe();window.speechSynthesis?.cancel();};
  },[]);
  useEffect(()=>{
    document.documentElement.classList.toggle('desktop-dot-hidden',!state?.visible);
  },[state?.visible]);
  useEffect(()=>{
    if (!state) return;
    document.documentElement.dataset.theme=state.theme;
    if (!state.visible || !state.voice || document.hidden) { window.speechSynthesis?.cancel();return; }
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance==='undefined') {setError('Spoken updates are unavailable on this device.');return;}
    const phrase=`${state.dot?.name ?? 'Your dot'}: ${state.caption}`;
    if (lastSpoken.current===phrase) return;
    const timer=setTimeout(()=>{
      if (document.hidden) return;
      lastSpoken.current=phrase;
      window.speechSynthesis?.cancel();
      const speech=new SpeechSynthesisUtterance(phrase);speech.rate=1.04; window.speechSynthesis?.speak(speech);
    },750);
    return ()=>clearTimeout(timer);
  },[state?.caption,state?.dot?.id,state?.dot?.name,state?.voice,state?.theme,state?.visible]);
  useEffect(()=>{
    const hide=()=>{if(document.hidden)window.speechSynthesis?.cancel();};
    document.addEventListener('visibilitychange',hide);
    return ()=>document.removeEventListener('visibilitychange',hide);
  },[]);
  const control=async(action:DesktopDotAction)=> {
    try {await window.desktopDot.control(action,action==='stop'?state?.runId:undefined);setError('');} catch {setError('Open Dots to review this action.');}
  };
  if (!state) return <div className="desktop-dot-widget"><p>{error || 'Meeting your dot…'}</p></div>;
  return <section className="desktop-dot-widget" data-activity={state.activity} aria-label="Desktop dot live activity">
    <div className="desktop-dot-drag" title="Drag to move your dot"><GripHorizontal size={15}/><span>{state.pinned?'Following this dot':'Following active work'}</span></div>
    <button className="widget-dismiss" aria-label="Hide desktop dot" title="Hide desktop dot" onClick={()=>control('hide')}><X size={13}/></button>
    <div className="widget-companion"><DotAvatar dot={state.dot ?? undefined} size={85} animated activity={state.activity} backgroundMotion/></div>
    <div className="widget-bubble">
      <div className="widget-bubble-heading"><strong>{state.dot?.name ?? 'Your dot'}</strong><ActivityGlyph kind={state.activity} active={state.canStop && !['approval','queued'].includes(state.activity)}/></div>
      <p className="widget-caption" role="status" aria-live="polite">{error || state.caption}</p>
      {state.taskTitle && <p className="widget-task" title={state.taskTitle}>{state.taskTitle}</p>}
      <div className="widget-actions">
        <button className="widget-open" onClick={()=>control('open')}>{state.activity==='approval'?'Review':'Open Dots'}<ArrowUpRight size={12}/></button>
        {state.canStop&&<button aria-label="Stop current task" title="Stop current task" onClick={()=>control('stop')}><Square size={11}/></button>}
        {state.dotCount>1&&<button aria-label="Next teammate" title="Next teammate" onClick={()=>control('next')}><ChevronRight size={14}/></button>}
        {state.pinned&&<button aria-label="Follow active work" title="Follow active work" onClick={()=>control('auto')}><Radio size={13}/></button>}
        <button aria-label={state.voice?'Mute spoken updates':'Speak activity updates'} title={state.voice?'Mute spoken updates':'Speak activity updates'} aria-pressed={state.voice} onClick={()=>control('toggle-voice')}>{state.voice?<Volume2 size={13}/>:<VolumeX size={13}/>}</button>
      </div>
    </div>
  </section>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><DesktopDotWidget/></StrictMode>);
