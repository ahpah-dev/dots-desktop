(() => {
  const tours = {
    overview: { number: '01 / YOUR HOME', title: 'A little clarity\nfor your day.', description: 'See what your dots are working on, open a recent task, and pick up the conversation from one place.', points: ['All your teammates in one workspace', 'Progress and results you can inspect', 'Quick access to the next thing to do'] },
    context: { number: '02 / SHARED CONTEXT', title: 'Less repeating.\nMore remembering.', description: 'Give each dot a purpose and a workspace. Its conversation and editable notes keep useful context available for the next task.', points: ['Persistent conversations between runs', 'Memory you can review and update', 'Local files close to the work'] },
    routines: { number: '03 / ROUTINES', title: 'The next check,\nalready on the calendar.', description: 'Choose when the recurring work happens. Keep the app in the system tray and return to a clear record of each run.', points: ['Interval, daily, and cron schedules', 'Background execution while Dots runs', 'Pause a routine whenever you need to'] },
    control: { number: '04 / YOUR CONTROL', title: 'A capable teammate.\nClear boundaries.', description: 'Choose the tools and permissions each dot gets. Review its work, respond to decisions, and stop a task at any point.', points: ['Separate file, shell, and web permissions', 'Approval controls for supported tools', 'Inspect activity and task results'] }
  };
  const tabs = Array.from(document.querySelectorAll('[data-tour]'));
  function selectTour(tab, focus = false) {
    const tour = tours[tab.dataset.tour];
    if (!tour) return;
    tabs.forEach(item => { const active = item === tab; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    document.getElementById('tour-panel').setAttribute('aria-labelledby', tab.id);
    document.getElementById('tour-number').textContent = tour.number;
    const title = document.getElementById('tour-title');
    title.replaceChildren(...tour.title.split('\n').flatMap((line, index) => index ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
    document.getElementById('tour-description').textContent = tour.description;
    document.getElementById('tour-points').replaceChildren(...tour.points.map(point => { const li = document.createElement('li'); li.textContent = point; return li; }));
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelector('.tour-copy').animate([{ opacity: .3, translate: '0 7px' }, { opacity: 1, translate: '0 0' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTour(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectTour(tabs[next], true); }
    });
  });
  const dialog = document.getElementById('screenshot-dialog');
  document.getElementById('open-screenshot').addEventListener('click', () => dialog.showModal());
  document.getElementById('close-screenshot').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
})();

(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealItems = document.querySelectorAll('.section-heading,.possibility-card,.demo-intro,.film-shell,.film-chapters,.tour-content,.detail-intro,.detail-grid article,.connection-section>div,.questions-section>.section-heading,.faq-list,.download-section');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -25px 0px' });
    revealItems.forEach((item, index) => {
      item.dataset.reveal = '';
      item.style.setProperty('--reveal-delay', `${item.classList.contains('possibility-card') ? index % 3 * 90 : 0}ms`);
      revealObserver.observe(item);
    });
    const syncMotion = () => document.documentElement.classList.toggle('motion-ready', !reducedMotion.matches);
    syncMotion();
    reducedMotion.addEventListener('change', syncMotion);
  }

  const progress = document.createElement('div');
  progress.className = 'scroll-progress'; progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(progress);
  let scrollFrame = 0;
  function updateProgress() {
    scrollFrame = 0;
    const range = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.setProperty('--scroll-progress', String(range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0));
  }
  window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProgress); }, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  const world = document.querySelector('.hero-world');
  if ('IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver(([entry]) => world.classList.toggle('is-resting', !entry.isIntersecting));
    heroObserver.observe(world);
  }
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let pointerFrame = 0;
    world.addEventListener('pointermove', event => {
      if (reducedMotion.matches || pointerFrame) return;
      const x = event.clientX, y = event.clientY;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const bounds = world.getBoundingClientRect();
        world.style.setProperty('--pointer-x', `${((x - bounds.left) / bounds.width - .5) * 12}px`);
        world.style.setProperty('--pointer-y', `${((y - bounds.top) / bounds.height - .5) * 9}px`);
      });
    }, { passive: true });
    world.addEventListener('pointerleave', () => {
      if (pointerFrame) { cancelAnimationFrame(pointerFrame); pointerFrame = 0; }
      world.style.setProperty('--pointer-x', '0px'); world.style.setProperty('--pointer-y', '0px');
    });
    document.querySelectorAll('.possibility-card').forEach(card => {
      let frame = 0;
      card.addEventListener('pointermove', event => {
        if (reducedMotion.matches || frame) return;
        const x = event.clientX, y = event.clientY;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const bounds = card.getBoundingClientRect();
          const rx = (x - bounds.left) / bounds.width, ry = (y - bounds.top) / bounds.height;
          card.style.setProperty('--tilt-x', `${(ry - .5) * -4}deg`);
          card.style.setProperty('--tilt-y', `${(rx - .5) * 4}deg`);
          card.style.setProperty('--spot-x', `${rx * 100}%`); card.style.setProperty('--spot-y', `${ry * 100}%`);
        });
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  const video = document.getElementById('demo-video');
  const stage = document.getElementById('film-stage');
  const play = document.getElementById('film-play');
  const status = document.getElementById('film-status');
  const chapters = [...document.querySelectorAll('[data-demo-time]')];
  let pendingSeek = null;
  video.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null) { video.currentTime = pendingSeek; pendingSeek = null; }
  });
  async function startFilm(time) {
    if (play.disabled) return;
    play.disabled = true; status.textContent = 'Loading the film…';
    if (Number.isFinite(video.duration)) video.currentTime = time;
    else pendingSeek = time;
    try {
      await video.play();
      stage.classList.add('has-started');
      status.textContent = '';
      video.focus({ preventScroll: true });
    } catch {
      status.textContent = 'The film could not start. Try playing it again, or use your browser’s video controls.';
    } finally { play.disabled = false; }
  }
  play.addEventListener('click', () => startFilm(video.ended ? 0 : video.currentTime || 0));
  chapters.forEach(chapter => chapter.addEventListener('click', () => startFilm(Number(chapter.dataset.demoTime))));
  video.addEventListener('play', () => { stage.classList.add('has-started'); status.textContent = ''; });
  video.addEventListener('error', () => { status.textContent = 'The film could not load. Reload the page to try again.'; play.disabled = false; });
  video.addEventListener('timeupdate', () => {
    let active;
    chapters.forEach(chapter => { if (video.currentTime >= Number(chapter.dataset.demoTime)) active = chapter; });
    chapters.forEach(chapter => chapter.setAttribute('aria-current', String(chapter === active)));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      world.classList.add('is-resting');
      if (!video.paused) video.pause();
    } else { world.classList.toggle('is-resting', world.getBoundingClientRect().bottom < 0); }
  });
})();
