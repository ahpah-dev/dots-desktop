import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startQaProvider } from './qa-provider.mjs';
const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const provider = await startQaProvider({ chunkDelayMs: 1 });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env });
try {
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.overview-heading');
  const dot = await page.evaluate(async (baseUrl) => {
    const profile = await window.dots.api.saveProviderProfile({ label: 'Message QA', baseUrl, defaultModel: 'qa-model', apiKey: 'fixture' });
    return window.dots.api.createDot({ name: 'Message QA', description: '', instructions: '', color: '#35785c', emoji: '🟢', providerId: profile.id, model: 'qa-model', notify: false,
      permissions: { files: 'none', shell: false, web: false, outsideWorkspace: false, approval: 'never' } });
  }, provider.baseUrl);
  await page.locator('.sidebar-dot').filter({ hasText: 'Message QA' }).click();
  const wait = async (count) => {
    await page.waitForFunction(async ({ id, count }) => {
      const runs = await window.dots.api.listRuns(id);
      return runs.length === count && runs.every(r => r.status === 'succeeded');
    }, { id: dot.id, count });
    await page.waitForFunction(() => [...document.querySelectorAll('.message-actions button')].some(b => !b.disabled));
    return page.evaluate(id => window.dots.api.listRuns(id), dot.id);
  };
  const send = async (text, count) => {
    const composer = page.getByRole('textbox', { name: 'Message Message QA' });
    await composer.fill(text); await composer.press('Enter'); return wait(count);
  };
  await send('Earlier preference', 1);
  const original = (await send('Original question', 2))[0];
  await send('Discarded future secret', 3);
  const question = page.locator('.user-message').filter({ has: page.locator('p', { hasText: /^Original question$/ }) });
  await question.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit your message').fill('Cancelled edit');
  await page.getByLabel('Edit your message').press('Escape');
  assert.equal(await page.getByLabel('Edit your message').count(), 0);
  await question.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Edit your message').fill('Changed question');
  await page.getByRole('button', { name: 'Save & resend', exact: true }).click();
  const edited = (await wait(4))[0];
  assert.notEqual(edited.conversationId, original.conversationId);
  await page.waitForFunction(() => document.querySelectorAll('.user-message').length === 2);
  assert.deepEqual(await page.locator('.user-message > p').allTextContents(), ['Earlier preference', 'Changed question']);
  const request = provider.calls.findLast(c => c.userPrompt === 'Changed question');
  const requestText = JSON.stringify(request.messages);
  assert.ok(requestText.includes('Earlier preference'));
  assert.ok(!requestText.includes('Discarded future secret'));
  assert.ok(!requestText.includes('Original question'));
  await page.screenshot({ path: resolve('artifacts/qa/message-edit-branch.png') });
  await page.locator('.user-message').last().getByRole('button', { name: 'Revert here', exact: true }).click();
  const reverted = (await wait(5))[0];
  assert.equal(reverted.prompt, 'Changed question');
  assert.notEqual(reverted.conversationId, edited.conversationId);
  assert.equal((await page.evaluate(id => window.dots.api.listRuns(id), dot.id)).find(r => r.id === original.id).prompt, 'Original question');
  await page.reload();
  await page.waitForSelector('.sidebar-dot');
  await page.locator('.sidebar-dot').filter({ hasText: 'Message QA' }).click();
  await page.getByRole('button', { name: /Conversations/ }).click();
  await page.locator('.history-popover button').filter({ hasText: 'Discarded future secret' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.user-message').length === 3);
  assert.deepEqual(await page.locator('.user-message > p').allTextContents(), ['Earlier preference', 'Original question', 'Discarded future secret']);
  assert.deepEqual(errors, []);
  console.log('PASS edit, cancel, revert, prior context, discarded context isolation, original history, reload and zero renderer errors');
} finally { await app.close(); await provider.close(); }
