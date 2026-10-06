import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const root = resolve('.');
const output = resolve(root, 'website/assets/demo');
await mkdir(output, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--demo-mode'], env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.overview-dot-card');
  await page.evaluate(() => window.dots.api.updateSettings({ theme: 'light' }));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.screenshot({ path: resolve(output, 'overview.png'), animations: 'disabled' });
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search commands and dots' }).fill('Atlas');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.workspace-breadcrumb');
  await page.screenshot({ path: resolve(output, 'conversation.png'), animations: 'disabled' });
  for (const [tab, selector, name] of [
    ['Memory', '.memory-card', 'memory'],
    ['Responsibilities', '.responsibility-card', 'responsibilities'],
    ['Profile', '.avatar-editor', 'profile'],
  ]) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForSelector(selector);
    if (tab === 'Profile') {
      await page.getByRole('button', { name: 'Permissions', exact: true }).click();
      await page.getByLabel('Workspace file access').waitFor();
    }
    await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' });
  }
  console.log('Captured actual app footage for the promotional film.');
} finally {
  await app.close();
}
