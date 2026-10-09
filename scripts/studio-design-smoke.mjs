/** Workspace navigation and design checks through the actual Electron app. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright");
const output = resolve("artifacts/qa/studio-design");
await mkdir(output, { recursive: true });
const checks = [], errors = [];
const check = (name, condition = true) => {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
let failConnection = false, modelRequests = 0;
const server = createServer((request, response) => {
  modelRequests++;
  setTimeout(() => {
    response.writeHead(failConnection ? 503 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(failConnection ? { error: { message: "Fixture temporarily unavailable" } } : { data: [{ id: "studio-model", supported_parameters: ["tools"] }] }));
  }, 180);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require("electron"), args: process.env.DOTS_SMOKE_EXECUTABLE ? ["--demo-mode"] : [resolve("."), "--demo-mode"], env, timeout: 60_000 });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".overview-dot-card");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => !window.webContents.getURL().includes("widget.html")).setSize(1280, 920));
  await page.evaluate(() => window.dots.api.updateSettings({ desktopNotifications: false, desktopDotEnabled: false }));
  const bootstrap = await page.evaluate(() => window.dots.api.getBootstrap());
  const firstDot = bootstrap.dots[0];
  const search = page.getByRole("textbox", { name: "Search your dots", exact: true });
  check("Overview shows every existing dot", await page.locator(".overview-dot-card").count() === bootstrap.dots.length);
  check("Idle overview avatars do not animate continuously", await page.locator(".overview-dot-card .dot-mascot.is-animated").count() === bootstrap.dots.filter((dot) => !dot.paused && dot.status === "running").length);
  await search.fill(firstDot.name.toUpperCase());
  check("Overview finds dots without case sensitivity", await page.locator(".overview-dot-card").count() === bootstrap.dots.filter((dot) => `${dot.name} ${dot.description}`.toUpperCase().includes(firstDot.name.toUpperCase())).length);
  await page.getByRole("button", { name: "Clear dot search", exact: true }).click();
  check("Clearing search restores every dot", await page.locator(".overview-dot-card").count() === bootstrap.dots.length);
  await search.fill("no-such-dot-qa");
  await page.getByRole("heading", { name: "No dots match", exact: true }).waitFor();
  await page.getByRole("button", { name: "Show all dots", exact: true }).click();
  check("An empty search provides a working recovery action", await search.inputValue() === "" && await page.locator(".overview-dot-card").count() === bootstrap.dots.length);
  await page.locator(".overview-toolbar").getByRole("button", { name: "Working", exact: true }).click();
  check("Working filter reflects actual dot status", await page.locator(".overview-dot-card").count() === bootstrap.dots.filter((dot) => ["running", "queued"].includes(dot.status)).length);
  await page.locator(".overview-toolbar").getByRole("button", { name: "Needs you", exact: true }).click();
  check("Needs-you filter reflects actual approval status", await page.locator(".overview-dot-card").count() === bootstrap.dots.filter((dot) => dot.status === "awaiting-approval").length);
  await page.locator(".overview-toolbar").getByRole("button", { name: "All dots", exact: true }).click();
  await page.evaluate((id) => window.dots.api.updateDot(id, { paused: true }), firstDot.id);
  const sidebarDot = page.locator(".sidebar-dot").filter({ hasText: firstDot.name });
  await sidebarDot.locator(".sidebar-dot-info > span").filter({ hasText: "Paused" }).waitFor();
  check("Paused status is consistent in sidebar and overview", await sidebarDot.locator(".status-paused").count() === 1 && (await page.locator(".overview-dot-card").filter({ hasText: firstDot.name }).locator(".dot-card-footer").textContent()).includes("Paused"));
  await page.evaluate((id) => window.dots.api.updateDot(id, { paused: false }), firstDot.id);
  await page.keyboard.press("Control+k");
  const commands = page.getByRole("textbox", { name: "Search commands and dots", exact: true });
  await commands.fill("Teamwork");
  check("Teamwork appears once in command search", await page.locator(".command-results > button").count() === 1);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".team-layout");
  check("Command search opens teamwork by keyboard", await page.locator('.nav-item[aria-current="page"]').textContent() === "Teamwork");
  await page.screenshot({ animations: "disabled", path: resolve(output, "teamwork.png") });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => window.dots.api.updateSettings({ theme: value }), theme);
    await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
    await page.screenshot({ animations: "disabled", path: resolve(output, `overview-${theme}.png`) });
    check(`${theme} overview fits without horizontal scrolling`, await page.locator(".studio-page").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  }
  const provider = await page.evaluate((baseUrl) => window.dots.api.saveProviderProfile({ label: "Studio QA", baseUrl, defaultModel: "studio-model", requiresKey: false }), `http://127.0.0.1:${server.address().port}/v1`);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const card = page.locator(".connection-card").filter({ has: page.getByRole("heading", { name: "Studio QA", exact: true }) });
  await card.waitFor();
  const before = modelRequests;
  await card.getByRole("button", { name: "Test connection", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await card.getByRole("button", { name: "Testing…", exact: true }).waitFor();
  check("Provider check has visible pending feedback", await card.getByRole("button", { name: "Testing…", exact: true }).isDisabled());
  await card.locator(".connection-test-result.success").waitFor();
  check("Repeated provider clicks perform one check and show the actual result", (await card.getByRole("status").textContent()).includes("1 models available") && modelRequests - before === 1);
  failConnection = true;
  await card.getByRole("button", { name: "Test connection", exact: true }).click();
  await card.locator(".connection-test-result.error").waitFor();
  check("Provider failures are visible and can be retried", await card.getByRole("button", { name: "Test connection", exact: true }).isEnabled());
  await page.screenshot({ animations: "disabled", path: resolve(output, "connections-dark.png") });
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.waitFor();
  check("Connections exposes provider setup directly", await settings.getByRole("button", { name: "Add provider", exact: true }).count() > 0);
  await page.screenshot({ animations: "disabled", path: resolve(output, "settings-providers-dark.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().includes("widget.html")); window.setMinimumSize(0, 0); window.setSize(720, 960); });
  await page.screenshot({ animations: "disabled", path: resolve(output, "overview-narrow.png") });
  check("Narrow overview controls and cards fit", await page.locator(".studio-page").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  check("No renderer errors", errors.length === 0);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ checks, rendererErrors: errors }, null, 2));
  console.log(JSON.stringify({ result: "passed", checks }));
} finally {
  if (app) await app.close();
  await new Promise((done) => server.close(done));
}
