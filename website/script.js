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
