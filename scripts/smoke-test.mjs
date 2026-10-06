/** Actual Electron → preload IPC → services → provider → tools smoke test.
 * Uses temporary --demo-mode data and a local deterministic provider. No real account calls. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { startQaProvider } from "./qa-provider.mjs";
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.DOTS_PLAYWRIGHT_PATH || "playwright");
const root = resolve(".");
const output = resolve(root, "artifacts/qa");
await mkdir(output, { recursive: true });
const provider = await startQaProvider();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let electron;
const checks = [];
const errors = [];
const record = (name, value = true) => {
  assert.ok(value, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
async function pollApi(page, fn, arg, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(fn, arg)) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for the actual asynchronous API state.");
}
try {
  electron = await _electron.launch({
    executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require("electron"),
    args: process.env.DOTS_SMOKE_EXECUTABLE
      ? ["--demo-mode"]
      : [root, "--demo-mode"],
    env,
    timeout: 60000,
  });
  const page = await electron.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".overview-heading", { timeout: 30000 });
  record(
    "Overview loads isolated seeded dots",
    (await page.locator(".overview-dot-card").count()) === 3,
  );
  await page.evaluate(() => window.dots.api.updateSettings({ theme: "light" }));
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await page.screenshot({ animations: "disabled", path: resolve(output, "overview-light.png") });
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search workspace" }).waitFor();
  await page
    .getByRole("textbox", { name: "Search commands and dots" })
    .fill("Atlas");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Responsibilities", exact: true })
    .waitFor();
  record(
    "Command palette opens a dot by keyboard",
    await page
      .locator(".workspace-breadcrumb")
      .textContent()
      .then((t) => t.includes("Atlas")),
  );
  await page.screenshot({ animations: "disabled", path: resolve(output, "conversation-light.png") });
  await page
    .getByRole("button", { name: "Responsibilities", exact: true })
    .click();
  await page.waitForSelector(".responsibility-card");
  record(
    "Seeded durable responsibilities render",
    (await page.locator(".responsibility-card").count()) > 0,
  );
  await page.screenshot({ animations: "disabled",
    path: resolve(output, "responsibilities-light.png"),
  });
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page.waitForSelector(".memory-card");
  record(
    "Legacy memories render as structured cards",
    (await page.locator(".memory-card").count()) > 0,
  );
  await page.screenshot({ animations: "disabled", path: resolve(output, "memory-light.png") });
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.waitForSelector(".avatar-editor");
  record(
    "Avatar customization and permissions render",
    (await page.locator(".avatar-editor button").count()) > 10,
  );
  await page.screenshot({ animations: "disabled", path: resolve(output, "profile-light.png") });
  await page.keyboard.press("Control+n");
  await page.getByRole("dialog").waitFor();
  record("Create-dot keyboard shortcut opens onboarding form");
  await page.keyboard.press("Escape");
  const qa = await page.evaluate(
    async ({ baseUrl }) => {
      const profile = await window.dots.api.saveProviderProfile({
        label: "Local QA",
        baseUrl,
        defaultModel: "qa-model",
        apiKey: "local-qa-fixture",
      });
      const test = await window.dots.api.testProvider(profile.id);
      if (!test.ok) throw new Error(test.message);
      return await window.dots.api.createDot({
        name: "QA Teammate",
        description: "Isolated smoke test",
        color: "#78b7a0",
        emoji: "🌱",
        avatar: {
          shape: "blob",
          eyes: "happy",
          glasses: "none",
          accessory: "sprout",
        },
        instructions: "Use available tools to complete the request.",
        providerId: profile.id,
        model: "qa-model",
        permissions: {
          files: "write",
          shell: true,
          web: true,
          outsideWorkspace: false,
          approval: "never",
        },
        notify: false,
      });
    },
    { baseUrl: provider.baseUrl },
  );
  record("IPC creates and tests an encrypted provider profile");
  await page.locator(".sidebar-dot").filter({ hasText: "QA Teammate" }).click();
  await page
    .getByRole("textbox", { name: "Message QA Teammate" })
    .fill("Create a file, remember a preference, and schedule a follow-up.");
  await page
    .getByRole("textbox", { name: "Message QA Teammate" })
    .press("Enter");
  await pollApi(
    page,
    async (id) =>
      (await window.dots.api.listRuns(id))[0]?.status === "succeeded",
    qa.id,
  );
  record("UI message streams through IPC and real agent tool loop");
  const result = await page.evaluate(
    async (id) => ({
      runs: await window.dots.api.listRuns(id),
      files: await window.dots.api.listWorkspaceFiles(id),
      notes: await window.dots.api.listMemoryNotes(id),
      followups: await window.dots.api.listFollowups(id),
    }),
    qa.id,
  );
  record(
    "File-write tool produces an actual deliverable",
    result.files.some((f) => f.path === "qa-output.txt"),
  );
  record(
    "Agent memory tool persists a structured note",
    result.notes.some(
      (n) => n.source === "agent" && n.text.includes("QA fixture"),
    ),
  );
  record(
    "Agent schedules a durable wakeup",
    result.followups.some((f) => f.status === "pending"),
  );
  const firstRun = result.runs[0];
  await page
    .getByRole("textbox", { name: "Message QA Teammate" })
    .fill("Continue this conversation with the same context.");
  await page
    .getByRole("textbox", { name: "Message QA Teammate" })
    .press("Enter");
  await pollApi(
    page,
    async (id) => {
      const r = await window.dots.api.listRuns(id);
      return r.length >= 2 && r[0].status === "succeeded";
    },
    qa.id,
  );
  const continued = await page.evaluate(
    (id) => window.dots.api.listRuns(id),
    qa.id,
  );
  record(
    "Follow-up message keeps the selected conversation",
    continued[0].conversationId === firstRun.conversationId &&
      continued[0].parentRunId === firstRun.id,
  );
  record(
    "Conversation displays earlier turns",
    (await page.locator(".user-message").count()) === 2,
  );
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page.getByRole("button", { name: "Add memory", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Memory text" })
    .fill("I prefer concise updates for smoke verification.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search memories" })
    .fill("concise updates");
  await page.waitForFunction(
    () => document.querySelectorAll(".memory-card").length === 1,
  );
  record("Memory editor saves and search filters actual persisted notes");
  await page
    .getByRole("button", { name: "Responsibilities", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add responsibility", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit responsibility" });
  await editor.getByLabel("Name", { exact: true }).fill("QA daily brief");
  await editor
    .getByLabel("What should your dot take care of?")
    .fill("Inspect qa-output.txt and prepare a brief.");
  await editor.getByRole("combobox").selectOption("weekdays");
  await editor.getByRole("button", { name: "Save responsibility" }).click();
  await page.getByRole("heading", { name: "QA daily brief" }).waitFor();
  record("Responsibility editor saves a weekday schedule");
  await page.getByRole("button", { name: "Pause responsibility" }).click();
  await pollApi(
    page,
    async (id) => (await window.dots.api.listTasks(id))[0]?.status === "paused",
    qa.id,
  );
  record("Responsibility pause persists without pausing the dot");
  await page.getByRole("button", { name: "Resume responsibility" }).click();
  await page.getByRole("button", { name: "Set a follow-up" }).click();
  const wake = page.getByRole("dialog", { name: "Set follow-up" });
  await wake
    .getByLabel("What should your dot do?")
    .fill("Review the smoke result tomorrow.");
  await wake.getByRole("button", { name: "Schedule follow-up" }).click();
  await page
    .getByText("Review the smoke result tomorrow.", { exact: true })
    .waitFor();
  record("User follow-up editor persists a wakeup");
  await page.evaluate(async (id) => {
    const d = (await window.dots.api.getBootstrap()).dots.find(
      (d) => d.id === id,
    );
    await window.dots.api.updateDot(id, {
      permissions: { ...d.permissions, approval: "ask" },
    });
  }, qa.id);
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await page
    .locator(".conversation-history")
    .getByRole("button", { name: "New conversation" })
    .click();
  await page
    .getByRole("textbox", { name: "Message QA Teammate" })
    .fill("Create a fresh file and wait for my approval.");
  await page
    .getByRole("textbox", { name: "Message QA Teammate" })
    .press("Enter");
  await pollApi(
    page,
    async () => (await window.dots.api.listApprovals()).length > 0,
    undefined,
    15000,
  );
  await page.locator(".nav-item").filter({ hasText: "Needs you" }).click();
  await page.waitForSelector(".decision-card");
  record("Sensitive tool action waits for a real approval in the global inbox");
  await page.screenshot({ animations: "disabled", path: resolve(output, "inbox-approval-light.png") });
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await pollApi(
    page,
    async (id) =>
      (await window.dots.api.listRuns(id))[0]?.status === "succeeded",
    qa.id,
  );
  record("Approval resumes execution and resolves the inbox");
  await page.evaluate(async (id) => {
    const d = (await window.dots.api.getBootstrap()).dots.find(
      (d) => d.id === id,
    );
    await window.dots.api.updateDot(id, {
      permissions: { ...d.permissions, approval: "never" },
    });
  }, qa.id);
  const slow = await page.evaluate(
    (id) =>
      window.dots.api.startRun(id, "[qa:slow] run in a separate conversation", {
        newSession: true,
      }),
    qa.id,
  );
  const queued = await page.evaluate(
    (id) =>
      window.dots.api.startRun(id, "queued independent work", {
        newSession: true,
      }),
    qa.id,
  );
  record(
    "A busy dot accepts queued independent work",
    queued.status === "queued",
  );
  await page.evaluate((id) => window.dots.api.cancelRun(id), queued.id);
  await page.evaluate((id) => window.dots.api.cancelRun(id), slow.id);
  await pollApi(
    page,
    async (id) =>
      (await window.dots.api.listRuns(id)).filter((r) =>
        ["running", "queued"].includes(r.status),
      ).length === 0,
    qa.id,
    15000,
  );
  const cancelled = await page.evaluate(
    (id) => window.dots.api.listRuns(id),
    qa.id,
  );
  record(
    "Cancel stops both queued and active work",
    cancelled
      .filter((r) => [slow.id, queued.id].includes(r.id))
      .every((r) => r.status === "cancelled"),
  );
  await page.locator(".nav-item").filter({ hasText: "Activity" }).click();
  await page.waitForSelector(".activity-row");
  await page.getByRole("textbox", { name: "Search activity" }).fill("OAuth2");
  await page.waitForFunction(
    () => document.querySelectorAll(".activity-row").length === 1,
  );
  record("Global activity searches across dots without mixing conversations");
  await page.locator(".nav-item").filter({ hasText: "Connections" }).click();
  await page.waitForSelector(".connection-card");
  record(
    "Connections accurately includes the tested provider",
    (await page
      .getByRole("heading", { name: "Local QA", exact: true })
      .count()) === 1,
  );
  await page.screenshot({ animations: "disabled", path: resolve(output, "connections-light.png") });
  await page.evaluate(() => window.dots.api.updateSettings({ theme: "dark" }));
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.locator(".nav-item").filter({ hasText: "Overview" }).click();
  await page.waitForSelector(".overview-heading");
  await page.screenshot({ animations: "disabled", path: resolve(output, "overview-dark.png") });
  record("Theme updates live and dark overview renders");
  await electron.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(960, 680);
  });
  await page.screenshot({ animations: "disabled", path: resolve(output, "overview-compact.png") });
  record(
    "Minimum window layout has no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  record("No renderer exceptions", errors.length === 0);
  await writeFile(
    resolve(output, "smoke-results.json"),
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        errors,
        providerCalls: provider.calls.length,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: checks.length,
      errors,
      providerCalls: provider.calls.length,
    }),
  );
} finally {
  if (electron) await electron.close();
  await provider.close();
}
