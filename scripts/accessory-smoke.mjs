import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const output = resolve('artifacts/qa'); await mkdir(output, { recursive: true });
const workspaces = resolve(output, 'accessory-workspaces'); await mkdir(workspaces, { recursive: true });
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env, timeout: 60_000 });
const errors = [], checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const options = [['none','None'],['cap','Cap'],['sprout','Sprout'],['headphones','Headphones'],['beanie','Beanie'],['bow','Bow'],['crown','Crown'],['flower','Flower'],['antenna','Antenna'],['party-hat','Party hat'],['scarf','Scarf'],['top-hat','Top hat']];
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.overview-dot-card');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('widget.html')).setSize(1280, 1000));
  await page.evaluate(defaultWorkspaceRoot => window.dots.api.updateSettings({ theme: 'light', desktopNotifications: false, defaultWorkspaceRoot }), workspaces);
  await page.locator('.overview-dot-card').first().click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.waitForSelector('.avatar-editor');
  const name = await page.getByLabel('Name', { exact: true }).inputValue();
  const before = (await page.evaluate(() => window.dots.api.getBootstrap())).dots.find(dot => dot.name === name);
  const preview = page.locator('.avatar-editor-preview');
  const accessories = page.getByRole('group', { name: 'Accessory', exact: true });
  check('Twelve accessory choices have visual previews', await accessories.locator('button .dot-mascot').count() === 12);
  for (const [id, label] of options) {
    await accessories.getByRole('button', { name: label, exact: true }).click();
    await preview.locator(`[data-accessory="${id}"]`).waitFor({ state: 'attached' });
    if (id !== 'none') {
      await page.getByLabel('Custom accessory color', { exact: true }).fill('#dd4488');
      check(`${label} supports a custom color`, await preview.locator(`[data-accessory="${id}"] [fill="#dd4488"]`).count() > 0);
    }
  }
  await accessories.getByRole('button', { name: 'Crown', exact: true }).click();
  await page.getByRole('group', { name: 'Glasses', exact: true }).getByRole('button', { name: 'Round', exact: true }).click();
  await page.getByLabel('Custom glasses color', { exact: true }).fill('#345abc');
  check('Glasses have a separate color', await preview.locator('[data-glasses][stroke="#345abc"]').count() === 1);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(id => window.dots.api.getBootstrap().then(s => s.dots.find(d => d.id === id)?.avatar?.glassesColor === '#345abc'), before.id);
  const saved = (await page.evaluate(() => window.dots.api.getBootstrap())).dots.find(dot => dot.id === before.id);
  check('Saving retains body color and both accessory colors', saved.color === before.color && saved.avatar.accessory === 'crown' && saved.avatar.accessoryColor === '#dd4488' && saved.avatar.glassesColor === '#345abc');
  const sidebar = page.locator('.sidebar-dot').filter({ hasText: name });
  check('Saved accessories render in the sidebar', await sidebar.locator('[data-accessory="crown"] [fill="#dd4488"]').count() > 0);
  await page.locator('.profile-panel').evaluate(element => element.scrollTop = 0);
  await page.screenshot({ path: resolve(output, 'accessories-profile-light.png') });
  await page.evaluate(() => window.dots.api.updateSettings({ theme: 'dark' }));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.screenshot({ path: resolve(output, 'accessories-profile-dark.png') });
  await page.reload(); await page.waitForSelector('.sidebar-dot');
  await page.locator('.sidebar-dot').filter({ hasText: name }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.waitForSelector('.avatar-editor');
  check('Profile reload restores both color inputs', await page.getByLabel('Custom accessory color', { exact: true }).inputValue() === '#dd4488' && await page.getByLabel('Custom glasses color', { exact: true }).inputValue() === '#345abc');
  await page.getByRole('button', { name: 'Reset accessory color', exact: true }).click();
  check('Default reset restores the crown color', await preview.locator('[data-accessory="crown"] [fill="#e5c77d"]').count() > 0);
  await accessories.getByRole('button', { name: 'None', exact: true }).click();
  check('Accessory color controls hide when none is selected', await page.getByLabel('Custom accessory color', { exact: true }).count() === 0);
  await accessories.getByRole('button', { name: 'Crown', exact: true }).click();
  await page.getByLabel('Custom accessory color', { exact: true }).fill('#dd4488');
  await page.evaluate(() => window.dots.api.updateSettings({ desktopDotEnabled: true, desktopDotMode: 'always' }));
  await page.waitForTimeout(500);
  const widget = app.windows().find(window => window.url().includes('widget.html'));
  assert.ok(widget, 'Desktop companion exists'); widget.on('pageerror', error => errors.push(error.message));
  await widget.waitForSelector('.dot-mascot');
  for (let i = 0; i < 12 && (await widget.evaluate(() => window.desktopDot.getState())).dot?.id !== before.id; i++) {
    await widget.getByRole('button', { name: 'Next teammate' }).click();
    await widget.waitForTimeout(150);
  }
  check('Desktop companion renders the saved accessory and glasses colors', await widget.locator('[data-accessory="crown"] [fill="#dd4488"]').count() > 0 && await widget.locator('[data-glasses][stroke="#345abc"]').count() === 1);
  await widget.screenshot({ path: resolve(output, 'accessories-desktop.png') });
  await page.evaluate(() => window.dots.api.updateSettings({ desktopDotEnabled: false, theme: 'light' }));
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.keyboard.press('Control+n');
  const dialog = page.getByRole('dialog', { name: 'Meet your new dot', exact: true }); await dialog.waitFor();
  await dialog.getByLabel('Name', { exact: true }).fill('Accessory QA');
  await dialog.getByRole('button', { name: 'Beanie', exact: true }).click();
  await dialog.getByLabel('Custom accessory color', { exact: true }).fill('#4b79d1');
  await dialog.screenshot({ path: resolve(output, 'accessories-new-dot.png') });
  check('New dot accessory cards fit without clipping', await dialog.locator('.avatar-accessory-options').evaluate(element => element.scrollWidth <= element.clientWidth));
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create Accessory QA', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const created = (await page.evaluate(() => window.dots.api.getBootstrap())).dots.find(dot => dot.name === 'Accessory QA');
  check('New dots save the chosen accessory and custom color', created?.avatar?.accessory === 'beanie' && created.avatar.accessoryColor === '#4b79d1');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('widget.html')); window.setMinimumSize(0, 0); window.setSize(620, 940); });
  await page.screenshot({ path: resolve(output, 'accessories-profile-narrow.png') });
  check('Narrow accessory picker fits without horizontal scrolling', await page.locator('.avatar-accessory-options').evaluate(element => element.scrollWidth <= element.clientWidth));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', checks, rendererErrors: errors }));
} finally {
  await app.close();
}
