// Dots Desktop Landing Page Interactive Features
document.addEventListener('DOMContentLoaded', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. Data Store for Interactive Agent Studio
  // ─────────────────────────────────────────────────────────────
  const agentsData = {
    engineer: {
      name: 'Autonomous Engineer',
      emoji: '⚡',
      badge: 'idle',
      badgeColor: '#10b981',
      model: 'GPT-6.1 Sol',
      desc: 'Senior full-stack autonomous engineer. Refactors architecture, executes terminal tasks, and verifies tests.',
      placeholder: 'Assign a task to Autonomous Engineer... (Press Ctrl+Enter to run)',
      tasks: {
        title: 'Implement OAuth2 PKCE Authentication & Verify Tests',
        tokens: '38,420 tokens • 1m 24s elapsed',
        steps: [
          { icon: '📂', tool: 'readFile', text: 'Loaded 142 lines of session middleware from src/auth/session.ts', status: '✓ OK' },
          { icon: '📝', tool: 'writeFile', text: 'Created RFC 7636 PKCE code challenge and verifier helper functions in src/auth/pkce.ts', status: '✓ OK' },
          { icon: '⚡', tool: 'shell', text: 'Executed: npm test -- --grep "auth" (PASS 24 passed, 0 failed in 1.42s)', status: '✓ 24 PASSED' },
          { icon: '🧠', tool: 'memorySave', text: 'Persisted OAuth2 PKCE rotation rules to agent durable memory', status: '✓ SAVED' }
        ],
        resultTitle: 'Authentication Upgraded to OAuth2 + PKCE',
        resultText: 'Replaced legacy token exchange with standard RFC 7636 PKCE flow. Implemented transparent refresh token rotation with single-use replay revocation. All 24 unit & integration test suites passed with zero regressions.',
        code: `// RFC 7636 compliant PKCE challenge generator
export async function verifyPKCE(verifier: string, challenge: string): Promise<boolean> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(hash) === challenge;
}`
      },
      memory: [
        '# Autonomous Engineer Long-Term Memory',
        '- Node.js 22 LTS & TypeScript 5.7 are standard across this repository.',
        '- Authentication requires RFC 7636 PKCE code challenge verification with SHA-256.',
        '- Refresh token rotation: Revoke token family immediately upon detected duplicate reuse.',
        '- All unit tests must be executed with vitest / jest prior to marking runs succeeded.'
      ].join('\n'),
      schedule: {
        type: 'On-Demand Execution',
        details: 'Configured for manual triggers & event-driven webhooks. Triggered automatically on commit pushes to main.'
      },
      files: [
        'src/auth/session.ts (142 lines)',
        'src/auth/pkce.ts (86 lines)',
        'src/auth/__tests__/pkce.test.ts (114 lines)',
        'package.json',
        'tsconfig.json'
      ]
    },
    market: {
      name: 'Market Intelligence',
      emoji: '🔍',
      badge: 'idle',
      badgeColor: '#10b981',
      model: 'GPT-6 Astra',
      desc: 'Live intelligence agent. Uses headless web browsing, search extraction, and comparative market analysis.',
      placeholder: 'Assign a research topic to Market Intelligence... (Press Ctrl+Enter to run)',
      tasks: {
        title: 'Deep Research: 2026 AI Agent Architecture Benchmarks',
        tokens: '41,120 tokens • 2m 05s elapsed',
        steps: [
          { icon: '🌐', tool: 'webSearch', text: 'DuckDuckGo search: "autonomous agent architectures state of the art 2026"', status: '✓ 12 SOURCES' },
          { icon: '📄', tool: 'webFetch', text: 'Extracted technical papers on tool calling latency & sleep-drift scheduling', status: '✓ PARSED' },
          { icon: '🔍', tool: 'browser', text: 'Rendered headless browser evaluation matrix for model reasoning metrics', status: '✓ OK' },
          { icon: '🧠', tool: 'memorySave', text: 'Indexed 8 key agent frameworks and latency comparisons to memory.md', status: '✓ SAVED' }
        ],
        resultTitle: 'Autonomous Agent Benchmark Report Compiled',
        resultText: 'Completed comparative survey across leading agent architectures. Local execution with isolated filesystem workspaces yielded 3.4x faster turnarounds than remote containerized approaches. Codex app-server protocol demonstrated sub-80ms first-token latency.',
        code: `### Comparative Benchmark Summary
1. Codex App-Server IPC: 76ms avg TTFT (Rank 1)
2. Direct REST HTTP API: 240ms avg TTFT
3. Long-term SQLite Memory Recall: 4.2ms avg retrieval`
      },
      memory: [
        '# Market Intelligence Memory Index',
        '- Primary research focus: Autonomous developer agents, desktop sandboxing, local LLMs.',
        '- Key metrics tracked: TTFT (Time to First Token), tool latency, token efficiency ratio.',
        '- Keyless web search provider configured: DuckDuckGo API (HTML extraction + headless rendering).'
      ].join('\n'),
      schedule: {
        type: 'Weekly Digest',
        details: 'Scheduled every Monday at 08:00 AM. Gathers industry news and compiles a digest in ~/DotsWorkspaces/market-intelligence/briefings/'
      },
      files: [
        'briefings/2026-agent-benchmarks.md',
        'sources/papers-index.json',
        'memory.md'
      ]
    },
    watchdog: {
      name: 'Release Watchdog',
      emoji: '⏱️',
      badge: 'scheduled',
      badgeColor: '#f59e0b',
      model: 'GPT-5.6 Sol',
      desc: 'Automated CI/CD health auditor running scheduled background smoke tests and verifying build outputs.',
      placeholder: 'Trigger immediate audit with Release Watchdog... (Press Ctrl+Enter to run)',
      tasks: {
        title: 'Nightly Build Verification & Artifact Integrity Check',
        tokens: '19,840 tokens • 48s elapsed',
        steps: [
          { icon: '⚡', tool: 'shell', text: 'Executed: git log -n 5 --oneline (Checked upstream main commit hashes)', status: '✓ 5 COMMITS' },
          { icon: '📦', tool: 'shell', text: 'Executed: npm run dist:dir (Packaged electron x64 binaries)', status: '✓ SUCCESS' },
          { icon: '🛡️', tool: 'shell', text: 'Validated ASAR integrity and digital signatures on Dots.exe', status: '✓ VERIFIED' },
          { icon: '🧠', tool: 'memorySave', text: 'Recorded successful build checksum to release ledger', status: '✓ LOGGED' }
        ],
        resultTitle: 'Release Build v1.0.6 Health Check Passed',
        resultText: 'All packaging checks completed with 0 errors. Executable binaries verified for Windows 10 & 11 (64-bit). No uncommitted dependencies or vulnerable packages detected.',
        code: `Release Artifact: release/win-unpacked/Dots.exe
Hash (SHA-256): e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
Status: Clean (Signed & Verified)`
      },
      memory: [
        '# Release Watchdog Durable Ledger',
        '- Nightly schedule: Daily at 02:00 AM UTC (resilient to PC sleep/wake cycles).',
        '- Artifact build target: Windows NSIS Installer + Unpacked Directory.',
        '- Notification rules: Only alert desktop notification if exit code !== 0.'
      ].join('\n'),
      schedule: {
        type: 'Daily at 02:00 AM',
        details: 'Resilient cron schedule (0 2 * * *). If computer is suspended, the watchdog detects sleep drift and fires immediately on resume.'
      },
      files: [
        'reports/nightly-audit.log',
        'checksums.sha256',
        'memory.md'
      ]
    }
  };

  let currentAgentKey = 'engineer';
  let currentTabKey = 'tasks';

  // DOM Elements
  const viewDemoBtn = document.getElementById('viewDemoBtn');
  const viewScreenshotBtn = document.getElementById('viewScreenshotBtn');
  const interactiveWorkspace = document.getElementById('interactiveWorkspace');
  const screenshotWrapper = document.getElementById('screenshotWrapper');
  const windowTitleText = document.getElementById('windowTitleText');

  const agentHeaderEmoji = document.getElementById('agentHeaderEmoji');
  const agentHeaderName = document.getElementById('agentHeaderName');
  const agentHeaderBadge = document.getElementById('agentHeaderBadge');
  const agentHeaderModel = document.getElementById('agentHeaderModel');
  const agentHeaderDesc = document.getElementById('agentHeaderDesc');
  const mockInputPlaceholder = document.getElementById('mockInputPlaceholder');
  const tabBody = document.getElementById('tabBody');
  const simulateRunBtn = document.getElementById('simulateRunBtn');

  const agentSwitcher = document.getElementById('agentSwitcher');

  // ─────────────────────────────────────────────────────────────
  // 2. View Switcher: Interactive Demo vs Real Screenshot
  // ─────────────────────────────────────────────────────────────
  if (viewDemoBtn && viewScreenshotBtn && interactiveWorkspace && screenshotWrapper) {
    viewDemoBtn.addEventListener('click', () => {
      viewDemoBtn.classList.add('active');
      viewScreenshotBtn.classList.remove('active');
      interactiveWorkspace.style.display = 'flex';
      screenshotWrapper.style.display = 'none';
      if (agentSwitcher) agentSwitcher.style.display = 'flex';
      if (windowTitleText) windowTitleText.innerText = 'Dots Desktop — Autonomous Agent Studio (Dark Mode)';
    });

    viewScreenshotBtn.addEventListener('click', () => {
      viewScreenshotBtn.classList.add('active');
      viewDemoBtn.classList.remove('active');
      interactiveWorkspace.style.display = 'none';
      screenshotWrapper.style.display = 'block';
      if (agentSwitcher) agentSwitcher.style.display = 'none';
      if (windowTitleText) windowTitleText.innerText = 'Dots Desktop — Polished Windows Interface (Live App)';
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Render Agent Content
  // ─────────────────────────────────────────────────────────────
  function renderAgent(agentKey) {
    const data = agentsData[agentKey];
    if (!data) return;
    currentAgentKey = agentKey;

    if (agentHeaderEmoji) agentHeaderEmoji.innerText = data.emoji;
    if (agentHeaderName) agentHeaderName.innerText = data.name;
    if (agentHeaderBadge) {
      agentHeaderBadge.innerText = data.badge;
      agentHeaderBadge.style.color = data.badgeColor;
      agentHeaderBadge.style.borderColor = data.badgeColor;
    }
    if (agentHeaderModel) agentHeaderModel.innerText = data.model;
    if (agentHeaderDesc) agentHeaderDesc.innerText = data.desc;
    if (mockInputPlaceholder) mockInputPlaceholder.innerText = data.placeholder;

    // Update chips & rows
    document.querySelectorAll('.agent-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.getAttribute('data-agent') === agentKey);
    });
    document.querySelectorAll('.mock-dot-row').forEach((row) => {
      row.classList.toggle('active', row.getAttribute('data-agent') === agentKey);
    });

    renderTab(currentTabKey);
  }

  function renderTab(tabKey) {
    currentTabKey = tabKey;
    const data = agentsData[currentAgentKey];
    if (!tabBody || !data) return;

    document.querySelectorAll('.mock-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabKey);
    });

    if (tabKey === 'tasks') {
      const task = data.tasks;
      tabBody.innerHTML = `
        <div class="mock-run-card">
          <div class="mock-run-header">
            <span class="mock-run-title">${task.title}</span>
            <span class="mock-run-tokens">${task.tokens}</span>
          </div>

          <div class="mock-steps-list">
            ${task.steps
              .map(
                (s) => `
              <div class="mock-step-row">
                <span class="mock-step-icon">${s.icon}</span>
                <span class="mock-step-text">
                  <span class="mock-step-tool">${s.tool}:</span> ${s.text}
                </span>
                <span class="mock-step-status">${s.status}</span>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="mock-result-box">
            <div class="mock-result-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${task.resultTitle}</span>
            </div>
            <p class="mock-result-text">${task.resultText}</p>
            <pre class="mock-code-snippet"><code>${task.code}</code></pre>
          </div>
        </div>
      `;
    } else if (tabKey === 'memory') {
      tabBody.innerHTML = `
        <div class="mock-run-card">
          <div class="mock-run-header">
            <span class="mock-run-title">Durable Memory File (memory.md)</span>
            <span class="mock-run-tokens">Auto-summarized after each run</span>
          </div>
          <pre class="mock-code-snippet" style="font-size: 0.8rem; line-height: 1.6; color: #e2e8f0; background: #0c0d12; border-color: var(--border-medium);">${data.memory}</pre>
        </div>
      `;
    } else if (tabKey === 'schedule') {
      tabBody.innerHTML = `
        <div class="mock-run-card">
          <div class="mock-run-header">
            <span class="mock-run-title">${data.schedule.type}</span>
            <span class="mock-run-tokens">Sleep-Drift Resilient</span>
          </div>
          <p class="mock-result-text" style="margin-bottom: 1rem;">${data.schedule.details}</p>
          <div class="mock-step-row">
            <span class="mock-step-icon">⏱️</span>
            <span class="mock-step-text">Status: Active & monitoring • Keeps executing when minimized to system tray.</span>
            <span class="mock-step-status">ENABLED</span>
          </div>
        </div>
      `;
    } else if (tabKey === 'files') {
      tabBody.innerHTML = `
        <div class="mock-run-card">
          <div class="mock-run-header">
            <span class="mock-run-title">Isolated Agent Workspace</span>
            <span class="mock-run-tokens">Path Traversal Sandboxed</span>
          </div>
          <div class="mock-steps-list">
            ${data.files
              .map(
                (f) => `
              <div class="mock-step-row">
                <span class="mock-step-icon">📄</span>
                <span class="mock-step-text">${f}</span>
                <span class="mock-step-status">LOCAL FILE</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    }
  }

  // Bind agent clicks
  document.querySelectorAll('.agent-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const agentKey = chip.getAttribute('data-agent');
      if (agentKey) renderAgent(agentKey);
    });
  });

  document.querySelectorAll('.mock-dot-row').forEach((row) => {
    row.addEventListener('click', () => {
      const agentKey = row.getAttribute('data-agent');
      if (agentKey) renderAgent(agentKey);
    });
  });

  // Bind tab clicks
  document.querySelectorAll('.mock-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabKey = tab.getAttribute('data-tab');
      if (tabKey) renderTab(tabKey);
    });
  });

  // Bind simulate run button
  if (simulateRunBtn) {
    simulateRunBtn.addEventListener('click', () => {
      renderTab('tasks');
      const data = agentsData[currentAgentKey];
      if (!tabBody || !data) return;

      simulateRunBtn.classList.add('running');
      simulateRunBtn.innerHTML = `<span>Simulating...</span>`;

      const originalSteps = [...data.tasks.steps];
      tabBody.innerHTML = `
        <div class="mock-run-card">
          <div class="mock-run-header">
            <span class="mock-run-title">Executing: ${data.tasks.title}</span>
            <span class="mock-run-tokens" style="color: #6366f1;">● Streaming tools...</span>
          </div>
          <div class="mock-steps-list" id="animStepsList"></div>
        </div>
      `;

      const list = document.getElementById('animStepsList');
      let stepIndex = 0;

      const interval = setInterval(() => {
        if (stepIndex < originalSteps.length && list) {
          const s = originalSteps[stepIndex];
          const div = document.createElement('div');
          div.className = 'mock-step-row';
          div.innerHTML = `
            <span class="mock-step-icon">${s.icon}</span>
            <span class="mock-step-text"><span class="mock-step-tool">${s.tool}:</span> ${s.text}</span>
            <span class="mock-step-status">${s.status}</span>
          `;
          list.appendChild(div);
          stepIndex++;
        } else {
          clearInterval(interval);
          simulateRunBtn.classList.remove('running');
          simulateRunBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Simulate Run</span>
          `;
          renderTab('tasks');
        }
      }, 450);
    });
  }

  // Initial render
  renderAgent('engineer');

  // ─────────────────────────────────────────────────────────────
  // 4. Lightbox Modal for Real App Screenshot
  // ─────────────────────────────────────────────────────────────
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxBackdrop = document.getElementById('lightboxBackdrop');
  const lightboxClose = document.getElementById('lightboxClose');
  const expandBtn = document.getElementById('expandBtn');
  const mainScreenshot = document.getElementById('mainScreenshot');

  const openLightbox = () => {
    if (lightboxModal) {
      lightboxModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeLightbox = () => {
    if (lightboxModal) {
      lightboxModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  };

  if (expandBtn) expandBtn.addEventListener('click', openLightbox);
  if (mainScreenshot) mainScreenshot.addEventListener('click', openLightbox);
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal && lightboxModal.classList.contains('active')) {
      closeLightbox();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Quick Terminal Copy Button
  // ─────────────────────────────────────────────────────────────
  const copyCloneBtn = document.getElementById('copyCloneBtn');
  if (copyCloneBtn) {
    copyCloneBtn.addEventListener('click', async () => {
      const codeText = `git clone https://github.com/davidegeric-cloud/dots-desktop.git
cd dots-desktop
npm install
npm run dist`;

      try {
        await navigator.clipboard.writeText(codeText);
        const originalText = copyCloneBtn.innerText;
        copyCloneBtn.innerText = 'Copied!';
        copyCloneBtn.style.color = '#10b981';
        copyCloneBtn.style.borderColor = '#10b981';

        setTimeout(() => {
          copyCloneBtn.innerText = originalText;
          copyCloneBtn.style.color = '';
          copyCloneBtn.style.borderColor = '';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy code to clipboard', err);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Navbar Scroll Effect
  // ─────────────────────────────────────────────────────────────
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        navbar.style.background = 'rgba(9, 10, 15, 0.92)';
        navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
      } else {
        navbar.style.background = 'rgba(9, 10, 15, 0.75)';
        navbar.style.boxShadow = 'none';
      }
    });
  }
});
