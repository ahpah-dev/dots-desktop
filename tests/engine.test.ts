import { describe, expect, it } from 'vitest';
import { buildContext, extractMemoryUpdates } from '../src/main/engine/context';
import { isPrivateAddress, isObviouslyLocalHost, htmlToText } from '../src/main/tools/net';
import { CodexEventTranslator, humanizeCodexError, prettifyCommand } from '../src/main/providers/codex/events';
import type { Dot } from '@shared/types';
import { CODEX_PROVIDER_ID } from '@shared/types';

describe('context & memory update extraction', () => {
  it('extracts memory updates and removes memory tags from text', () => {
    const raw = `Here is what I completed:
- Refactored the authentication service
- Verified build succeeds

<memory_update>
- Project uses Node 22 with ESM modules
- Deployment requires docker compose
</memory_update>
Hope this helps!`;

    const { text, notes } = extractMemoryUpdates(raw);
    expect(notes).toEqual([
      'Project uses Node 22 with ESM modules',
      'Deployment requires docker compose'
    ]);
    expect(text).not.toContain('<memory_update>');
    expect(text).toContain('Here is what I completed:');
  });

  it('builds context with dot instructions and permissions', () => {
    const dot: Dot = {
      id: 'dot-1',
      name: 'Coder',
      description: 'Dev agent',
      color: '#6366f1',
      emoji: '💻',
      instructions: 'Always use TypeScript.',
      providerId: CODEX_PROVIDER_ID,
      model: 'auto',
      workspacePath: 'C:\\Work\\Test',
      permissions: {
        files: 'write',
        shell: true,
        web: true,
        outsideWorkspace: false,
        approval: 'never'
      },
      budget: { maxMinutes: 30, maxSteps: 60 },
      schedule: null,
      paused: false,
      notify: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const ctx = buildContext({
      dot,
      memory: '- Remember to run lint',
      recentRuns: [],
      trigger: 'manual',
      now: new Date('2026-10-03T12:00:00Z')
    });

    expect(ctx).toContain('# You are "Coder"');
    expect(ctx).toContain('Always use TypeScript.');
    expect(ctx).toContain('- Remember to run lint');
    expect(ctx).toContain('C:\\Work\\Test');
  });
});

describe('network safety checks', () => {
  it('correctly identifies private/local addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('169.254.1.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('142.250.190.46')).toBe(false);
  });

  it('detects local hostnames', () => {
    expect(isObviouslyLocalHost('localhost')).toBe(true);
    expect(isObviouslyLocalHost('sub.localhost')).toBe(true);
    expect(isObviouslyLocalHost('server.internal')).toBe(true);
    expect(isObviouslyLocalHost('127.0.0.1')).toBe(true);
    expect(isObviouslyLocalHost('google.com')).toBe(false);
  });

  it('converts html to readable text', () => {
    const html = `<html><head><title>My Title</title></head><body><h1>Header</h1><p>Paragraph with <a href="#">link</a>.</p></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('My Title');
    expect(text).toContain('Header');
    expect(text).toContain('Paragraph with link.');
  });
});

describe('codex event translator', () => {
  it('translates messages, commands, searches and usage', () => {
    const events: any[] = [];
    let threadId = '';
    const translator = new CodexEventTranslator(
      (e) => events.push(e),
      (id) => { threadId = id; }
    );

    translator.handle({ type: 'thread.started', thread_id: 'thread-xyz' });
    expect(threadId).toBe('thread-xyz');

    translator.handle({
      type: 'item.completed',
      item: { id: 'item_1', type: 'agent_message', text: 'I am starting the task.' }
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message');
    expect(events[0].text).toBe('I am starting the task.');

    translator.handle({
      type: 'item.completed',
      item: { id: 'item_2', type: 'command_execution', command: 'powershell.exe -Command echo hello', exit_code: 0, aggregated_output: 'hello' }
    });
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('tool');
    expect(events[1].category).toBe('shell');
    expect(events[1].input).toBe('echo hello');

    translator.handle({
      type: 'turn.completed',
      usage: { input_tokens: 100, output_tokens: 50, reasoning_output_tokens: 10 }
    });
    expect(translator.usage?.inputTokens).toBe(100);
    expect(translator.usage?.outputTokens).toBe(60);
  });

  it('humanizes error messages', () => {
    const raw = JSON.stringify({ error: { message: "The 'gpt-6-luna' model is not supported when using Codex with a ChatGPT account." } });
    const msg = humanizeCodexError(raw);
    expect(msg).toContain('Open this Dot\'s settings and choose a different model');
  });

  it('prettifies shell commands', () => {
    expect(prettifyCommand('powershell.exe -Command Get-ChildItem')).toBe('Get-ChildItem');
    expect(prettifyCommand('/bin/sh -c "ls -la"')).toBe('ls -la');
  });

  it('builds codex config args with proper sandbox policy', async () => {
    const { buildCodexConfigArgs } = await import('../src/main/providers/codex/provider');
    const dot: any = {
      permissions: {
        files: 'write',
        shell: true,
        web: true,
        outsideWorkspace: false,
        approval: 'never'
      },
      reasoningEffort: 'medium'
    };

    const args = buildCodexConfigArgs(dot, 'gpt-6.1-sol', false);
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('-m');
    expect(args).toContain('gpt-6.1-sol');
    expect(args).toContain('sandbox_mode=workspace-write');
    expect(args).toContain('approval_policy=never');
    if (process.platform === 'win32') {
      expect(args).toContain('windows.sandbox=elevated');
    }
  });
});

describe('model catalog and GPT-6 Astra, Sol & Luna support', () => {
  it('includes verified GPT-6 Astra, Sol, and Luna models and excludes nonexistent base IDs', async () => {
    const { KNOWN_GPT_MODELS, mergeModelsWithCatalog, groupModels } = await import('../src/shared/models');
    
    const ids = KNOWN_GPT_MODELS.map((m) => m.id);
    expect(ids).toContain('gpt-6.1-sol');
    expect(ids).toContain('gpt-6-astra');
    expect(ids).toContain('gpt-6-sol');
    expect(ids).toContain('gpt-6-luna');
    expect(ids).not.toContain('gpt-6.1');
    expect(ids).not.toContain('gpt-6');
    expect(ids).toContain('gpt-5.6-sol');

    // Test merging with Codex app-server returned models
    const fetched = [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', isDefault: true },
      { id: 'custom-fine-tune', label: 'Fine Tune v1' }
    ];
    const merged = mergeModelsWithCatalog(fetched);
    const mergedIds = merged.map((m) => m.id);

    expect(mergedIds[0]).toBe('gpt-6.1-sol');
    expect(mergedIds).toContain('gpt-6-astra');
    expect(mergedIds).toContain('custom-fine-tune');
    
    // Grouping
    const groups = groupModels(merged);
    const groupLabels = groups.map((g) => g.label);
    expect(groupLabels).toContain('GPT-6 Series (Astra, Sol & Luna)');
  });
});
