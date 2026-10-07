/** One visibility observer and one set of listeners for all animated avatars. */
const mascots = new Set<HTMLElement>();
let observer: IntersectionObserver | undefined;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
let scrolling = false;

const root = () => document.documentElement;
const hide = () => root().classList.add('mascots-hidden');
const syncVisibility = () => root().classList.toggle('mascots-hidden', document.hidden || !document.hasFocus());
const onScroll = () => {
  if (!scrolling) { scrolling = true; root().classList.add('mascots-scrolling'); }
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { scrolling = false; root().classList.remove('mascots-scrolling'); }, 160);
};

export function observeMascot(element: HTMLElement): () => void {
  if (!mascots.size) {
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) (entry.target as HTMLElement).dataset.motionVisible = String(entry.isIntersecting);
      });
    }
    document.addEventListener('visibilitychange', syncVisibility);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    window.addEventListener('focus', syncVisibility);
    syncVisibility();
  }
  mascots.add(element);
  element.dataset.motionVisible = observer ? 'false' : 'true';
  observer?.observe(element);
  return () => {
    observer?.unobserve(element);
    mascots.delete(element);
    if (!mascots.size) {
      observer?.disconnect(); observer = undefined;
      document.removeEventListener('visibilitychange', syncVisibility);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', syncVisibility);
      clearTimeout(scrollTimer); scrolling = false;
      root().classList.remove('mascots-hidden', 'mascots-scrolling');
    }
  };
}
