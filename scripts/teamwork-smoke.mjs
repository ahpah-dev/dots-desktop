/** Real Electron setup, token controls, multi-provider teamwork, cancellation and persistence. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const require = createRequire(import.meta.url),
  { _electron } = require("playwright");
const calls = [],
  checks = [],
  timers = new Set();
let hold = false;
const check = (name, condition = true) => {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
const server = createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: [
          {
            id: "tool-model:free",
            name: "Free tool model",
            context_length: 32000,
            supported_parameters: ["tools"],
            pricing: { prompt: "0", completion: "0" },
          },
          {
            id: "paid-model",
            name: "Paid tool model",
            supported_parameters: ["tools"],
            pricing: { prompt: ".1", completion: ".2" },
          },
          { id: "text-only", name: "Text model", supported_parameters: [] },
        ],
      }),
    );
    return;
  }
  let raw = "";
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  calls.push({ ...body, authorization: req.headers.authorization });
  const lead = body.messages.some((message) =>
    message.content?.includes("# Combine the team results"),
  );
  const text = lead
    ? "## Team result\nA verified proposal with clear evidence, a practical next step, and reviewed risks."
    : body.messages[0].content.includes('"Scout QA"')
      ? "Evidence gathered by Scout QA: use current sources and a clear next step."
      : "Reviewed by Writer QA: the proposal is clear, scoped, and supported.";
  const timer = setTimeout(
    () => {
      timers.delete(timer);
      if (res.destroyed) return;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: text }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 50,
            prompt_tokens_details: { cached_tokens: 25 },
          },
        }),
      );
    },
    hold ? 15000 : 650,
  );
  timers.add(timer);
  res.on("close", () => {
    clearTimeout(timer);
    timers.delete(timer);
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const output = resolve("artifacts/qa");
await mkdir(output, { recursive: true });
const workspace = join(output, "teamwork-workspaces");
await mkdir(workspace, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require("electron"),
  args: process.env.DOTS_SMOKE_EXECUTABLE
    ? ["--demo-mode"]
    : [resolve("."), "--demo-mode"],
  env,
  timeout: 60000,
});
const until = async (predicate) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for teamwork");
};
try {
  const page = await app.firstWindow(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".overview-dot-card");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().includes("widget.html"))
      .setSize(1360, 1020),
  );
  await page.evaluate(async (defaultWorkspaceRoot) => {
    await window.dots.api.updateSettings({
      theme: "light",
      desktopDotEnabled: false,
      desktopNotifications: false,
      maxConcurrentRuns: 2,
      defaultWorkspaceRoot,
    });
    for (const dot of (await window.dots.api.getBootstrap()).dots)
      await window.dots.api.updateDot(dot.id, {
        permissions: { ...dot.permissions, talkToDots: false },
      });
  }, workspace);
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.waitFor();
  await settings
    .getByRole("button", { name: "Model providers", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Add provider", exact: true })
    .click();
  check(
    "Eight guided provider presets",
    (await settings.locator(".provider-preset").count()) === 8,
  );
  await settings
    .getByRole("button", { name: /NVIDIA NIM Trial access/ })
    .click();
  check(
    "NVIDIA NIM endpoint and model filled in",
    (await settings
      .getByLabel("API base URL", { exact: true })
      .inputValue()) === "https://integrate.api.nvidia.com/v1" &&
      (await settings
        .getByLabel("Default model", { exact: true })
        .inputValue()) === "openai/gpt-oss-20b",
  );
  await settings
    .getByRole("button", { name: /OpenRouter Free models/ })
    .click();
  check(
    "Free router ready to select",
    (await settings
      .getByLabel("Default model", { exact: true })
      .inputValue()) === "openrouter/free",
  );
  await settings.getByRole("button", { name: /Ollama Local/ }).click();
  check(
    "Local setup does not require a key",
    (await settings
      .getByRole("switch", { name: "API key required" })
      .getAttribute("aria-checked")) === "false",
  );
  await settings.getByRole("button", { name: /Custom router Custom/ }).click();
  await settings.getByLabel("Provider name", { exact: true }).fill("Router QA");
  await settings
    .getByLabel("API base URL", { exact: true })
    .fill(`${baseUrl}/chat/completions`);
  await settings
    .getByLabel("API key", { exact: true })
    .fill("fixture-encrypted-key");
  await settings
    .getByRole("button", {
      name: "Test connection & discover models",
      exact: true,
    })
    .click();
  await settings.getByText(/Connected. Found 3 models./).waitFor();
  await settings.getByLabel("Free only", { exact: true }).check();
  await settings.getByLabel("Confirmed tool support", { exact: true }).check();
  check(
    "Free and tool-capable model filters",
    (await settings.locator(".discovered-models button").count()) === 1,
  );
  await settings.locator(".discovered-models button").click();
  await settings.screenshot({ path: join(output, "provider-setup-light.png") });
  await settings
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await until(() =>
    page.evaluate(() =>
      window.dots.api
        .getBootstrap()
        .then((value) =>
          value.providers.some((profile) => profile.label === "Router QA"),
        ),
    ),
  );
  await settings.getByRole("button", { name: "Done", exact: true }).click();
  const dataDir = await app.evaluate(({ app }) => app.getPath("userData"));
  const metadata = await readFile(join(dataDir, "providers.json"), "utf8");
  check(
    "Provider key encrypted outside metadata",
    !metadata.includes("fixture-encrypted-key") &&
      !(await readFile(join(dataDir, "credentials.bin"))).includes(
        Buffer.from("fixture-encrypted-key"),
      ),
  );
  const dots = await page.evaluate(
    async ({ baseUrl }) => {
      const state = await window.dots.api.getBootstrap();
      const remote = state.providers.find(
        (profile) => profile.label === "Router QA",
      );
      const local = await window.dots.api.saveProviderProfile({
        label: "Local QA",
        baseUrl,
        defaultModel: "tool-model:free",
        requiresKey: false,
      });
      const create = (name, providerId) =>
        window.dots.api.createDot({
          name,
          description: name.includes("Scout")
            ? "Research facts and sources"
            : "Review and write clearly",
          color: "#78b7a0",
          emoji: "x",
          instructions: "Be concise and finish your assigned work.",
          providerId,
          model: "auto",
          notify: false,
          permissions: {
            files: "read",
            shell: false,
            web: false,
            outsideWorkspace: false,
            approval: "never",
          },
        });
      return [
        await create("Scout QA", remote.id),
        await create("Writer QA", local.id),
      ];
    },
    { baseUrl },
  );
  check(
    "Two provider types and messaging enabled by default",
    dots.every((dot) => dot.permissions.talkToDots) &&
      dots[0].providerId !== dots[1].providerId,
  );
  await page.locator(".sidebar-dot").filter({ hasText: "Scout QA" }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Model & computer", exact: true })
    .click();
  await page.getByRole("button", { name: /Economy Short context/ }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await until(() =>
    page.evaluate(
      (id) =>
        window.dots.api
          .getBootstrap()
          .then(
            (value) =>
              value.dots.find((dot) => dot.id === id).budget
                .maxContextTokens === 6000,
          ),
      dots[0].id,
    ),
  );
  check(
    "Economy limits persist",
    (
      await page.evaluate(
        (id) =>
          window.dots.api
            .getBootstrap()
            .then((value) => value.dots.find((dot) => dot.id === id).budget),
        dots[0].id,
      )
    ).maxOutputTokens === 1024,
  );
  await page.getByRole("button", { name: "Teamwork", exact: true }).click();
  await page
    .getByLabel("Goal", { exact: true })
    .fill("Prepare a verified proposal with sources and review its risks.");
  await page
    .getByLabel("Task name (optional)", { exact: true })
    .fill("Proposal QA");
  await page.screenshot({ path: join(output, "teamwork-plan-light.png") });
  await page.getByRole("button", { name: /Create & review/ }).click();
  await page
    .getByRole("button", { name: "Start team task", exact: true })
    .click();
  await until(() =>
    page.evaluate(() =>
      window.dots.api
        .listTeamJobs()
        .then((jobs) => jobs[0]?.status === "succeeded"),
    ),
  );
  await page
    .getByRole("heading", { name: "Team result", exact: true })
    .first()
    .waitFor();
  const job = await page.evaluate(() =>
    window.dots.api.listTeamJobs().then((jobs) => jobs[0]),
  );
  check(
    "Create, review, and lead synthesis complete",
    job.steps.length === 2 &&
      job.steps.every((step) => step.status === "succeeded") &&
      job.result.includes("verified proposal"),
  );
  check(
    "Dependency results reach reviewer and lead",
    calls[1].messages.some((message) =>
      message.content?.includes("Evidence gathered by Scout QA"),
    ) &&
      calls[2].messages.some((message) =>
        message.content?.includes("Reviewed by Writer QA"),
      ),
  );
  check(
    "Bounded outputs, actual token totals and cached counts",
    calls[0].max_tokens === 1024 &&
      job.usage.inputTokens === 600 &&
      job.usage.outputTokens === 150 &&
      job.usage.cachedTokens === 75,
  );
  check(
    "No recursive messaging or synthesis tools",
    calls.every(
      (body) =>
        !body.tools?.some((tool) =>
          ["send_dot_message", "list_dots", "schedule_followup"].includes(
            tool.function.name,
          ),
        ),
    ) && !calls[2].tools,
  );
  check(
    "Each provider uses its own credential policy",
    calls[0].authorization === "Bearer fixture-encrypted-key" &&
      calls[1].authorization === undefined,
  );
  await page.screenshot({ path: join(output, "teamwork-result-light.png") });
  await page.evaluate(() => window.dots.api.updateSettings({ theme: "dark" }));
  await page.screenshot({ path: join(output, "teamwork-result-dark.png") });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().includes("widget.html"))
      .setSize(940, 1000),
  );
  await page.screenshot({ path: join(output, "teamwork-result-narrow.png") });
  check(
    "Narrow layout has no horizontal page overflow",
    await page
      .locator(".teamwork-page")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  );
  hold = true;
  await page
    .getByRole("button", { name: "New team task", exact: true })
    .click();
  await page
    .getByLabel("Task name (optional)", { exact: true })
    .fill("Stop and resume QA");
  await page
    .getByRole("button", { name: "Start team task", exact: true })
    .click();
  await until(() => calls.length > 3);
  await page
    .getByRole("button", { name: "Stop team task", exact: true })
    .click();
  await until(() =>
    page.evaluate(() =>
      window.dots.api
        .listTeamJobs()
        .then((jobs) => jobs[0]?.status === "cancelled"),
    ),
  );
  hold = false;
  await page
    .getByRole("button", { name: "Resume unfinished work", exact: true })
    .click();
  await until(() =>
    page.evaluate(() =>
      window.dots.api
        .listTeamJobs()
        .then((jobs) => jobs[0]?.status === "succeeded"),
    ),
  );
  check("Stop and resume through the actual UI");
  await page.reload();
  await page.waitForSelector(".sidebar-dot");
  await page.getByRole("button", { name: "Teamwork", exact: true }).click();
  await page
    .locator(".team-history-item")
    .filter({ hasText: "Proposal QA" })
    .click();
  await page
    .getByRole("heading", { name: "Team result", exact: true })
    .first()
    .waitFor();
  check("Team results survive renderer reload");
  await page.keyboard.press("Control+n");
  const wizard = page.getByRole("dialog", { name: "Meet your new dot", exact: true });
  await wizard.getByLabel("Name", { exact: true }).fill("Preset QA");
  await wizard.getByRole("button", { name: "Continue", exact: true }).click();
  await wizard.getByLabel("Token style", { exact: true }).selectOption("economy");
  await wizard.getByRole("button", { name: "Connect another provider", exact: true }).click();
  await settings.waitFor();
  check("New-dot shortcut opens provider settings", await settings.getByRole("button", { name: "Model providers", exact: true }).getAttribute("class") === "is-active");
  await page.keyboard.press("Escape");
  await settings.waitFor({ state: "hidden" });
  check("Closing provider setup preserves the dot draft", await wizard.isVisible() && await wizard.getByLabel("Token style", { exact: true }).inputValue() === "economy");
  await wizard.getByRole("button", { name: "Create Preset QA", exact: true }).click();
  await wizard.waitFor({ state: "hidden" });
  check("New-dot token preset persists", await page.evaluate(() => window.dots.api.getBootstrap().then(value => value.dots.find(dot => dot.name === "Preset QA")?.budget.maxContextTokens === 6000)));
  check("No renderer errors", errors.length === 0);
  await writeFile(
    join(output, "teamwork-results.json"),
    JSON.stringify(
      {
        executable: process.env.DOTS_SMOKE_EXECUTABLE || "development",
        version: (await page.evaluate(() => window.dots.api.getBootstrap()))
          .version,
        checks,
        calls: calls.length,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
  for (const timer of timers) clearTimeout(timer);
  await new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
}
