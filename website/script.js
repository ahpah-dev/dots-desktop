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
  // Native scroll timelines avoid per-frame JS and document layout reads.
  const world = document.querySelector('.hero-world');
  const filmStage = document.getElementById('film-stage');
  if ('IntersectionObserver' in window) {
    const ambientObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-resting', !entry.isIntersecting));
    });
    ambientObserver.observe(world);
    ambientObserver.observe(filmStage);
  }
  let scrollTimer;
  let scrolling = false;
  window.addEventListener('scroll', () => {
    if (!scrolling) {
      scrolling = true;
      document.documentElement.classList.add('is-scrolling');
    }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      scrolling = false;
      document.documentElement.classList.remove('is-scrolling');
    }, 160);
  }, { passive: true });

  // Small, user-triggered greetings; no pointer tracking or animation loop.
  document.querySelectorAll('button.mini-character').forEach(character => {
    let greetingTimer;
    character.addEventListener('click', () => {
      if (reducedMotion.matches || character.classList.contains('is-greeting')) return;
      character.classList.add('has-greeted');
      character.classList.add('is-greeting');
      clearTimeout(greetingTimer);
      greetingTimer = setTimeout(() => character.classList.remove('is-greeting'), 900);
    });
  });

  const video = document.getElementById('demo-video');
  const stage = document.getElementById('film-stage');
  const play = document.getElementById('film-play');
  const status = document.getElementById('film-status');
  const chapters = [...document.querySelectorAll('[data-demo-time]')];
  let pendingSeek = null;
  let playbackRequest = 0;
  video.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null) { video.currentTime = pendingSeek; pendingSeek = null; }
  });
  async function startFilm(time) {
    const request = ++playbackRequest;
    play.disabled = true; status.textContent = 'Loading the film…';
    if (Number.isFinite(video.duration)) video.currentTime = time;
    else pendingSeek = time;
    try {
      await video.play();
      if (request !== playbackRequest) return;
      stage.classList.add('has-started');
      status.textContent = '';
      video.focus({ preventScroll: true });
    } catch {
      if (request === playbackRequest) status.textContent = 'The film could not start. Try playing it again, or use your browser’s video controls.';
    } finally { if (request === playbackRequest) play.disabled = false; }
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
    document.documentElement.classList.toggle('is-hidden', document.hidden);
    if (document.hidden) {
      world.classList.add('is-resting');
      if (!video.paused) video.pause();
    } else { world.classList.toggle('is-resting', world.getBoundingClientRect().bottom < 0); }
  });
})();
