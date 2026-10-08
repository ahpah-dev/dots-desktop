import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PERMISSIONS, type TeamJobInput } from "@shared/types";
import { Paths } from "../src/main/util/paths";
import { DotStore } from "../src/main/storage/dotStore";
import { RunStore } from "../src/main/storage/runStore";
import {
  SettingsStore,
  defaultSettings,
} from "../src/main/storage/settingsStore";
import { RunManager } from "../src/main/engine/runManager";
import { TeamManager } from "../src/main/engine/teamManager";
import { ApprovalGate } from "../src/main/engine/approvals";
import type { ProviderRegistry } from "../src/main/providers/registry";
import {
  CancelledError,
  type AgentProvider,
  type RunContext,
} from "../src/main/providers/types";

const fixtures: { path: string; manager: RunManager; teams: TeamManager }[] =
  [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await f.teams.shutdown();
    await f.manager.shutdown();
    await f.teams.shutdown();
    await fs.rm(f.path, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
async function setup(run: AgentProvider["run"], slots = 1) {
  const path = await fs.mkdtemp(join(tmpdir(), "dots-team-"));
  const paths = new Paths(join(path, "data"));
  const dots = new DotStore(paths);
  await dots.init();
  const people = await Promise.all(
    ["Scout", "Writer", "Reviewer"].map((name) =>
      dots.create(
        {
          name,
          description: name,
          color: "#78b7a0",
          emoji: "x",
          instructions: "Own instructions.",
          providerId: name,
          model: "auto",
          permissions: { ...DEFAULT_PERMISSIONS },
          notify: false,
        },
        join(path, name),
      ),
    ),
  );
  const runs = new RunStore(paths);
  await runs.init(people.map((dot) => dot.id));
  const settings = new SettingsStore(
    paths.settings,
    defaultSettings(join(path, "workspaces")),
  );
  await settings.init();
  await settings.update({ maxConcurrentRuns: slots });
  const provider: AgentProvider = {
    id: "mock",
    label: "Mock",
    run,
    listModels: async () => [],
    test: async () => ({ ok: true, message: "" }),
  };
  const manager = new RunManager(
    dots,
    runs,
    { get: () => provider } as unknown as ProviderRegistry,
    settings,
    new ApprovalGate(),
  );
  const teams = new TeamManager(paths.teams, dots, runs, manager);
  await teams.init();
  fixtures.push({ path, manager, teams });
  const plan: TeamJobInput = {
    title: "Proposal",
    goal: "Prepare a verified proposal.",
    leadDotId: people[1].id,
    maxTokens: 60000,
    steps: people.map((dot, index) => ({
      id: `s${index}`,
      dotId: dot.id,
      title: dot.name,
      prompt: `Contribution from ${dot.name}`,
      dependsOn: [],
    })),
  };
  return { path, paths, dots, runs, manager, teams, people, plan };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 7000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Team did not finish");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const held = (ctx: RunContext) =>
  new Promise<never>((_, reject) => {
    if (ctx.signal.aborted) reject(new CancelledError());
    else
      ctx.signal.addEventListener("abort", () => reject(new CancelledError()), {
        once: true,
      });
  });

describe("durable multi-Dot orchestration", () => {
  it("runs dependencies and one synthesis without deadlock at concurrency one, preserving provider/permissions and usage", async () => {
    const seen: RunContext[] = [];
    const f = await setup(async (ctx) => {
      seen.push(ctx);
      expect(ctx.newSession).toBe(true);
      expect(ctx.sendDotMessage).toBeUndefined();
      expect(ctx.scheduleFollowup).toBeUndefined();
      expect(ctx.dot.permissions.files).toBe(DEFAULT_PERMISSIONS.files);
      ctx.emit({
        type: "usage",
        usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 10 },
      });
      return {
        finalMessage:
          ctx.run.team?.role === "synthesis"
            ? "Verified final proposal."
            : `Result from ${ctx.dot.name}`,
        usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 10 },
      };
    });
    f.plan.steps[2].dependsOn = ["s0", "s1"];
    const job = await f.teams.create(f.plan);
    await until(() => f.teams.list()[0].status === "succeeded");
    expect(seen.map((ctx) => ctx.dot.name)).toEqual([
      "Scout",
      "Writer",
      "Reviewer",
      "Writer",
    ]);
    expect(seen[2].prompt).toContain("Result from Scout");
    expect(seen[2].prompt).toContain("Result from Writer");
    expect(seen[3].prompt).toContain("Result from Reviewer");
    expect(seen[3].dot.providerId).toBe("Writer");
    expect(f.teams.list()[0]).toMatchObject({
      result: "Verified final proposal.",
      usage: { inputTokens: 400, outputTokens: 80, cachedTokens: 40 },
    });
    const restored = new TeamManager(f.paths.teams, f.dots, f.runs, f.manager);
    await restored.init();
    expect(restored.list()[0].id).toBe(job.id);
    expect(restored.list()[0].status).toBe("succeeded");
    await restored.shutdown();
  });
  it("starts independent workers concurrently and waits for all dependencies", async () => {
    const seen: string[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = await setup(async (ctx) => {
      seen.push(ctx.run.team!.stepId);
      if (ctx.run.team!.stepId === "s0") await blocked;
      return { finalMessage: "Contribution" };
    }, 3);
    f.plan.steps[2].dependsOn = ["s0", "s1"];
    await f.teams.create(f.plan);
    await until(() => seen.includes("s1"));
    expect(seen).not.toContain("s2");
    release();
    await until(() => f.teams.list()[0].status === "succeeded");
    expect(seen).toEqual(["s0", "s1", "s2", "synthesis"]);
  });
  it("rejects cycles, disabled or paused participants before creating any run", async () => {
    const f = await setup(async () => ({ finalMessage: "Done" }));
    await expect(
      f.teams.create({
        ...f.plan,
        steps: f.plan.steps.map((step, index) => ({
          ...step,
          dependsOn: [`s${(index + 1) % 3}`],
        })),
      }),
    ).rejects.toThrow("cycle");
    await f.dots.touch(f.people[0].id, { paused: true });
    await expect(f.teams.create(f.plan)).rejects.toThrow("resumed");
    await f.dots.touch(f.people[0].id, {
      paused: false,
      permissions: { ...DEFAULT_PERMISSIONS, talkToDots: false },
    });
    await expect(f.teams.create(f.plan)).rejects.toThrow("Talk");
    expect(f.runs.listAll()).toHaveLength(0);
  });
  it("stops the group when a worker fails and resumes only unfinished work with cumulative usage", async () => {
    let failing = true;
    const seen: string[] = [];
    const f = await setup(async (ctx) => {
      seen.push(ctx.run.team!.stepId);
      ctx.emit({
        type: "usage",
        usage: { inputTokens: 100, outputTokens: 10 },
      });
      if (ctx.run.team!.stepId === "s1" && failing)
        throw new Error("Fixture failure");
      return {
        finalMessage: "Done",
        usage: { inputTokens: 100, outputTokens: 10 },
      };
    });
    const job = await f.teams.create(f.plan);
    await until(
      () =>
        f.teams.list()[0].status === "failed" &&
        f.manager.activeCount() === 0 &&
        f.teams.list()[0].steps[2].status === "cancelled",
    );
    expect(f.teams.list()[0].steps[0].status).toBe("succeeded");
    expect(f.teams.list()[0].steps[2].status).toBe("cancelled");
    failing = false;
    await f.teams.resume(job.id, 10000);
    await until(() => f.teams.list()[0].status === "succeeded");
    expect(seen.filter((id) => id === "s0")).toHaveLength(1);
    expect(seen.filter((id) => id === "s1")).toHaveLength(2);
    expect(f.teams.list()[0].usage.inputTokens).toBe(500);
    expect(f.teams.list()[0].maxTokens).toBe(70000);
  });
  it("cancels running and queued steps, and ignores a stale cancellation after Resume", async () => {
    let holding = true;
    const f = await setup(async (ctx) =>
      holding ? held(ctx) : { finalMessage: "Done" },
    );
    const job = await f.teams.create(f.plan);
    await until(() => f.runs.listAll().some((run) => run.status === "running"));
    const old = f.runs.listAll()[0];
    await f.teams.cancel(job.id);
    holding = false;
    await f.teams.resume(job.id);
    f.manager.finished.emit({ ...old, status: "cancelled" });
    await until(() => f.teams.list()[0].status === "succeeded");
    expect(f.teams.list()[0].result).toBe("Done");
  });
  it("recovers interruption without automatically issuing model requests", async () => {
    const f = await setup(async (ctx) =>
      ctx.run.team!.stepId === "s0"
        ? { finalMessage: "Saved contribution" }
        : held(ctx),
    );
    await f.teams.create(f.plan);
    await until(
      () =>
        f.teams.list()[0].steps[0].status === "succeeded" &&
        f.runs.listAll().some((run) => run.status === "running"),
    );
    await f.teams.shutdown();
    await f.manager.shutdown();
    await f.teams.shutdown();
    const restored = new TeamManager(f.paths.teams, f.dots, f.runs, f.manager);
    await restored.init();
    expect(restored.list()[0].status).toBe("interrupted");
    expect(restored.list()[0].steps[0].result).toBe("Saved contribution");
    expect(f.manager.activeCount()).toBe(0);
    await restored.shutdown();
  });
});
