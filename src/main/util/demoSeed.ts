import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PERMISSIONS, type DotTask, type Followup } from '@shared/types';

export function seedDemoEnvironment(dir: string): void {
  mkdirSync(dir, { recursive: true });

  // 1. Settings
  const settings = {
    runInBackground: true,
    launchAtLogin: false,
    startMinimized: false,
    maxConcurrentRuns: 3,
    desktopNotifications: true,
    useCodexUserConfig: false,
    codexPathOverride: '',
    defaultWorkspaceRoot: join(dir, 'workspaces'),
    theme: 'light',
    onboardingComplete: true
  };
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');

  // 2. Dots directory
  const dotsDir = join(dir, 'dots');
  mkdirSync(dotsDir, { recursive: true });

  const dot1Dir = join(dotsDir, 'dot-demo-1');
  const dot1RunsDir = join(dot1Dir, 'runs');
  mkdirSync(dot1RunsDir, { recursive: true });

  const dot1 = {
    id: 'dot-demo-1',
    name: 'Atlas',
    description: 'Senior full-stack autonomous software engineer powered by GPT-6.1 Sol.',
    color: '#557b66',
    emoji: '⚡',
    avatar: { shape: 'squircle', eyes: 'happy', glasses: 'round', accessory: 'none' },
    instructions: 'Senior software engineer. Specializes in TypeScript, full-stack architecture, refactoring, and verifying unit test suites.',
    providerId: 'codex',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'high',
    workspacePath: join(dir, 'workspaces', 'autonomous-engineer'),
    permissions: DEFAULT_PERMISSIONS,
    budget: { maxMinutes: 30, maxSteps: 50 },
    schedule: null,
    paused: false,
    notify: true,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() + 100000,
    lastRunAt: Date.now() - 300000
  };
  writeFileSync(join(dot1Dir, 'dot.json'), JSON.stringify(dot1, null, 2), 'utf-8');
  mkdirSync(dot1.workspacePath, { recursive: true });
  writeFileSync(
    join(dot1Dir, 'memory.md'),
    `# Agent Memory\n\n- Project uses TypeScript 5.7 and Node.js 22 LTS.\n- OAuth2 PKCE challenge generation utilizes SHA-256 with 43-128 char code verifiers.\n- Refresh token rotation requires immediate family revocation upon duplicate reuse.\n`,
    'utf-8'
  );

  const run1 = {
    id: 'run-demo-1',
    dotId: 'dot-demo-1',
    trigger: 'manual',
    title: 'Implement OAuth2 PKCE Authentication & Verify Tests',
    prompt: 'Refactor auth middleware to use OAuth2 with PKCE, add refresh token rotation with replay detection, and run all unit and integration test suites.',
    newSession: true,
    status: 'succeeded',
    createdAt: Date.now() - 300000,
    startedAt: Date.now() - 290000,
    endedAt: Date.now() - 240000,
    usage: { inputTokens: 28140, outputTokens: 10280, cachedTokens: 3800 },
    finalMessage: `### ✅ OAuth2 + PKCE Authentication Upgraded\n\n- **PKCE Verification**: RFC 7636 compliant SHA-256 code challenge generation and validation.\n- **Token Rotation**: Transparent refresh token rotation with single-use replay detection.\n- **Test Coverage**: 24/24 unit & integration tests passing (\`npm test -- --grep "auth"\`).\n- **Durable Memory**: Saved OAuth2 PKCE security specifications and rotation policies to Dot long-term memory.`
  };
  writeFileSync(join(dot1RunsDir, 'run-demo-1.json'), JSON.stringify(run1, null, 2), 'utf-8');

  const run1Events = [
    { type: 'status', status: 'running', runId: 'run-demo-1', dotId: 'dot-demo-1', seq: 1, ts: Date.now() - 290000 },
    { type: 'user', text: run1.prompt, runId: 'run-demo-1', dotId: 'dot-demo-1', seq: 2, ts: Date.now() - 289000 },
    {
      type: 'tool',
      id: 't1',
      category: 'file',
      name: 'readFile',
      input: '{"path": "src/auth/session.ts"}',
      output: 'Loaded 142 lines of session middleware from workspace.',
      status: 'ok',
      runId: 'run-demo-1',
      dotId: 'dot-demo-1',
      seq: 3,
      ts: Date.now() - 280000
    },
    {
      type: 'tool',
      id: 't2',
      category: 'file',
      name: 'writeFile',
      input: '{"path": "src/auth/pkce.ts", "lines": 86}',
      output: 'Wrote RFC 7636 PKCE code challenge and verifier helper functions.',
      status: 'ok',
      runId: 'run-demo-1',
      dotId: 'dot-demo-1',
      seq: 4,
      ts: Date.now() - 270000
    },
    {
      type: 'tool',
      id: 't3',
      category: 'shell',
      name: 'shell',
      input: 'npm test -- --grep "auth"',
      output: 'PASS src/auth/__tests__/pkce.test.ts (24 passed, 0 failed)\nTest Suites: 1 passed, 1 total\nSnapshots:   0 total\nTime:        1.42s',
      status: 'ok',
      runId: 'run-demo-1',
      dotId: 'dot-demo-1',
      seq: 5,
      ts: Date.now() - 260000
    },
    {
      type: 'tool',
      id: 't4',
      category: 'memory',
      name: 'memorySave',
      input: '{"topic": "OAuth2 PKCE rotation rules"}',
      output: 'Updated durable agent memory file memory.md',
      status: 'ok',
      runId: 'run-demo-1',
      dotId: 'dot-demo-1',
      seq: 6,
      ts: Date.now() - 250000
    },
    {
      type: 'final',
      text: run1.finalMessage,
      runId: 'run-demo-1',
      dotId: 'dot-demo-1',
      seq: 7,
      ts: Date.now() - 241000
    },
    { type: 'status', status: 'succeeded', runId: 'run-demo-1', dotId: 'dot-demo-1', seq: 8, ts: Date.now() - 240000 }
  ];
  writeFileSync(
    join(dot1RunsDir, 'run-demo-1.jsonl'),
    run1Events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf-8'
  );

  // 3. Dot 2: Research Analyst
  const dot2Dir = join(dotsDir, 'dot-demo-2');
  mkdirSync(dot2Dir, { recursive: true });
  const dot2 = {
    id: 'dot-demo-2',
    name: 'Scout',
    description: 'Gathers live competitive intelligence, benchmark trends, and monitors industry reports.',
    color: '#8eab7f',
    emoji: '🔍',
    avatar: { shape: 'blob', eyes: 'happy', glasses: 'none', accessory: 'sprout' },
    instructions: 'Live market researcher. Uses headless web browsing and synthesis tools.',
    providerId: 'codex',
    model: 'gpt-6-astra',
    workspacePath: join(dir, 'workspaces', 'market-intelligence'),
    permissions: { ...DEFAULT_PERMISSIONS, shell: false },
    budget: { maxMinutes: 20, maxSteps: 30 },
    schedule: null,
    paused: false,
    notify: true,
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now(),
    lastRunAt: Date.now() - 1200000
  };
  writeFileSync(join(dot2Dir, 'dot.json'), JSON.stringify(dot2, null, 2), 'utf-8');
  mkdirSync(dot2.workspacePath, { recursive: true });

  // 4. Dot 3: Release Watchdog
  const dot3Dir = join(dotsDir, 'dot-demo-3');
  mkdirSync(dot3Dir, { recursive: true });
  const dot3 = {
    id: 'dot-demo-3',
    name: 'Willow',
    description: 'Automated CI/CD health auditor running scheduled background smoke tests.',
    color: '#b5a56d',
    emoji: '⏱️',
    avatar: { shape: 'circle', eyes: 'dot', glasses: 'square', accessory: 'headphones' },
    instructions: 'Autonomous release monitor. Checks commit statuses, runs smoke tests, and notifies on failure.',
    providerId: 'codex',
    model: 'gpt-5.6-sol',
    workspacePath: join(dir, 'workspaces', 'release-watchdog'),
    permissions: DEFAULT_PERMISSIONS,
    budget: { maxMinutes: 15, maxSteps: 20 },
    schedule: {
      enabled: false,
      spec: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
      prompt: 'Review release health and report any failures.',
      continueSession: true
    },
    paused: false,
    notify: true,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
    lastRunAt: Date.now() - 14400000
  };
  writeFileSync(join(dot3Dir, 'dot.json'), JSON.stringify(dot3, null, 2), 'utf-8');
  mkdirSync(dot3.workspacePath, { recursive: true });

  const now = Date.now();
  const tasks: DotTask[] = [
    { id: 'task-demo-project', dotId: dot1.id, title: 'Keep the project moving', prompt: 'Review project progress, identify the next useful improvement, and report what needs attention.', status: 'active', schedule: null, continueSession: true, conversationId: 'conversation-demo-project', nextRunAt: null, lastRunId: run1.id, lastRunAt: run1.endedAt, createdAt: now - 86400000, updatedAt: now },
    { id: 'task-demo-quality', dotId: dot1.id, title: 'Weekly quality review', prompt: 'Review tests and technical debt, then prepare a concise quality report with specific next steps.', status: 'active', schedule: { kind: 'daily', time: '10:00', days: [1] }, continueSession: true, conversationId: 'conversation-demo-quality', nextRunAt: now + 6 * 86400000, createdAt: now - 3600000, updatedAt: now }
  ];
  const followups: Followup[] = [
    { id: 'followup-demo-review', dotId: dot1.id, prompt: 'Check the authentication migration results and summarize any issues needing attention.', dueAt: now + 2 * 3600000, status: 'pending', conversationId: 'conversation-demo-project', taskId: 'task-demo-project', createdAt: now - 1800000, updatedAt: now }
  ];
  writeFileSync(join(dot1Dir, 'responsibilities.json'), JSON.stringify({ tasks, followups }, null, 2), 'utf-8');
  writeFileSync(join(dot2Dir, 'responsibilities.json'), JSON.stringify({ tasks: [
    { id: 'task-demo-market', dotId: dot2.id, title: 'Monday market briefing', prompt: 'Track competitor releases and industry changes. Summarize meaningful changes with primary sources.', status: 'active', schedule: { kind: 'daily', time: '09:00', days: [1] }, continueSession: true, conversationId: 'conversation-demo-market', nextRunAt: now + 6 * 86400000, createdAt: now - 7200000, updatedAt: now }
  ], followups: [] }, null, 2), 'utf-8');
}
