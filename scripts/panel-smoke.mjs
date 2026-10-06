import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { _electron } = require("playwright");
const root = resolve(".");
const output = resolve(root, "artifacts/qa");
await mkdir(output, { recursive: true });
const testWorkspaces = resolve(output, "panel-workspaces");
await mkdir(testWorkspaces, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  executablePath: process.env.DOTS_ELECTRON_PATH || require("electron"),
  args: process.env.DOTS_ELECTRON_PATH ? ["--demo-mode"] : [root, "--demo-mode"],
  env,
  timeout: 60_000,
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

async function pollApi(predicate, argument, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, argument)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API state did not reach the expected value.");
}

try {
  await page.waitForSelector(".overview-dot-card", { timeout: 30_000 });
  await page.evaluate((workspaceRoot) => window.dots.api.updateSettings({ theme: "light", defaultWorkspaceRoot: workspaceRoot }), testWorkspaces);
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await page.locator(".overview-dot-card").first().click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.waitForSelector(".avatar-editor");
  const originalName = await page
    .getByLabel("Name", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Pebble", exact: true }).click();
  await page.getByRole("button", { name: "Happy", exact: true }).click();
  await page.getByRole("button", { name: "Headphones", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction((name) => {
    const error = document.querySelector('[role="alert"]');
    if (error) throw new Error(error.textContent);
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent.includes("Save changes"),
    );
    return button?.disabled && document.body.textContent.includes(name);
  }, originalName);
  const bootstrap = await page.evaluate(() => window.dots.api.getBootstrap());
  const dot = bootstrap.dots.find((item) => item.name === originalName);
  assert.equal(dot?.avatar?.shape, "blob");
  assert.equal(dot?.avatar?.eyes, "happy");
  assert.equal(dot?.avatar?.accessory, "headphones");
  await page.screenshot({
    path: resolve(output, "profile-personalization-light.png"),
  });
  await page.getByRole("button", { name: "Permissions", exact: true }).click();
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByLabel("Match text", { exact: true }).fill("production");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await pollApi(
    (id) =>
      window.dots.api
        .getBootstrap()
        .then((state) =>
          state.dots
            .find((item) => item.id === id)
            ?.permissions.rules?.some((rule) => rule.pattern === "production"),
        ),
    dot.id,
  );
  await page.screenshot({
    path: resolve(output, "profile-permissions-light.png"),
  });

  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page.waitForSelector(".memory-card, .profile-empty");
  await page.getByRole("button", { name: "Add memory", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("preference");
  await page
    .getByLabel("Memory text", { exact: true })
    .fill("Panel smoke: put a concise summary before the details.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  const memoryCard = page
    .locator(".memory-card")
    .filter({
      hasText: "Panel smoke: put a concise summary before the details.",
    });
  await memoryCard.waitFor();
  await memoryCard
    .getByRole("button", { name: "Edit memory", exact: true })
    .click();
  await page
    .getByLabel("Memory text", { exact: true })
    .fill("Panel smoke: remember the updated preference.");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  const updatedCard = page
    .locator(".memory-card")
    .filter({ hasText: "Panel smoke: remember the updated preference." });
  await updatedCard.waitFor();
  await page.screenshot({ path: resolve(output, "memory-cards-light.png") });
  await updatedCard
    .getByRole("button", { name: "Delete memory", exact: true })
    .click();
  await updatedCard
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await updatedCard.waitFor({ state: "hidden" });
  assert.equal(
    (
      await page.evaluate((id) => window.dots.api.listMemoryNotes(id), dot.id)
    ).some((note) => note.text.startsWith("Panel smoke:")),
    false,
  );

  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.waitForSelector(".workspace-file-list");
  await page.screenshot({ path: resolve(output, "workspace-files-light.png") });
  await page.getByRole("button", { name: "Scheduled", exact: true }).click();
  await page
    .getByRole("button", { name: "At a set time", exact: false })
    .click();
  await page.getByLabel("Time of day", { exact: true }).fill("10:30");
  await page
    .getByLabel("Task instructions", { exact: true })
    .fill(
      "Panel smoke schedule: inspect project health and report meaningful changes.",
    );
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await pollApi(
    (id) =>
      window.dots.api
        .getBootstrap()
        .then(
          (state) =>
            state.dots.find((item) => item.id === id)?.schedule?.spec.time ===
            "10:30",
        ),
    dot.id,
  );
  await page.screenshot({ path: resolve(output, "schedule-light.png") });

  await page.keyboard.press("Control+n");
  await page
    .getByRole("dialog", { name: "Meet your new dot", exact: true })
    .waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Panel Smoke Dot");
  await page.getByRole("button", { name: "Soft square", exact: true }).click();
  await page.screenshot({
    path: resolve(output, "new-dot-step-one-light.png"),
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.screenshot({
    path: resolve(output, "new-dot-step-two-light.png"),
  });
  await page
    .getByRole("button", { name: "Create Panel Smoke Dot", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Meet your new dot", exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document
      .querySelector(".workspace-breadcrumb")
      ?.textContent.includes("Panel Smoke Dot"),
  );
  assert.equal(
    (await page.evaluate(() => window.dots.api.getBootstrap())).dots.find(
      (item) => item.name === "Panel Smoke Dot",
    )?.avatar?.shape,
    "squircle",
  );

  await page.keyboard.press("Control+,");
  await page.getByRole("dialog", { name: "Settings", exact: true }).waitFor();
  await page.screenshot({
    path: resolve(output, "settings-account-light.png"),
  });
  await page
    .getByRole("button", { name: "Model providers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add provider", exact: true }).click();
  await page.screenshot({
    path: resolve(output, "settings-providers-light.png"),
  });
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.screenshot({ path: resolve(output, "settings-desktop-dark.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      avatarPersistence: true,
      permissionRulePersistence: true,
      memoryCreateEditDelete: true,
      schedulePersistence: true,
      newDotNavigation: true,
      settingsThemeAndEscape: true,
      rendererErrors: errors,
    }),
  );
} finally {
  await app.close();
}
