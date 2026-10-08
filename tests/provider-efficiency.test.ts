import { afterEach, describe, expect, it } from "vitest";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_BUDGET,
  DEFAULT_PERMISSIONS,
  type Dot,
  type RunEventBody,
} from "@shared/types";
import { normalizeBudget, estimateTokens } from "@shared/budget";
import { compactMessages } from "../src/main/providers/openai/efficiency";
import {
  listModelDetails,
  type ChatMessage,
} from "../src/main/providers/openai/chat";
import { OpenAICompatibleProvider } from "../src/main/providers/openai/provider";
import {
  ProviderStore,
  normalizeBaseUrl,
} from "../src/main/storage/providerStore";
import { CredentialStore } from "../src/main/storage/credentialStore";
import { defaultSettings } from "../src/main/storage/settingsStore";
import type { RunContext } from "../src/main/providers/types";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture(
  handler: (req: IncomingMessage, res: ServerResponse, body: any) => void,
) {
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    handler(req, res, raw ? JSON.parse(raw) : undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  const address = server.address();
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/v1`;
}
const json = (res: ServerResponse, body: unknown) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
async function context(history: ChatMessage[] = []) {
  const workspace = await fs.mkdtemp(join(tmpdir(), "dots-provider-"));
  cleanups.push(() => fs.rm(workspace, { recursive: true, force: true }));
  const dot: Dot = {
    id: "a",
    name: "Dot",
    description: "",
    color: "#78b7a0",
    emoji: "x",
    instructions: "",
    providerId: "local",
    model: "auto",
    workspacePath: workspace,
    permissions: { ...DEFAULT_PERMISSIONS, shell: false, web: false },
    budget: {
      ...DEFAULT_BUDGET,
      maxContextTokens: 6000,
      maxOutputTokens: 1024,
    },
    schedule: null,
    paused: false,
    notify: false,
    createdAt: 1,
    updatedAt: 1,
  };
  const events: RunEventBody[] = [];
  let messages: unknown[] = history;
  const ctx: RunContext = {
    dot,
    run: {
      id: "r",
      dotId: "a",
      trigger: "manual",
      title: "Task",
      prompt: "Current user request must stay intact.",
      status: "running",
      newSession: false,
      createdAt: 1,
    },
    context: "Standing instructions.",
    prompt: "Current user request must stay intact.",
    newSession: false,
    resumeThreadId: null,
    signal: new AbortController().signal,
    settings: defaultSettings(workspace),
    emit: (event) => events.push(event),
    setThreadId: () => {},
    requestApproval: async () => true,
    remember: async () => {},
    thread: {
      read: async () => ({ messages, updatedAt: 1 }),
      write: async (value) => {
        messages = value;
      },
    },
  };
  return { ctx, events, stored: () => messages };
}
const provider = (baseUrl: string, fallbackModels: string[] = []) =>
  new OpenAICompatibleProvider(
    {
      id: "local",
      kind: "openai-compatible",
      label: "Fixture",
      baseUrl,
      defaultModel: "local-model",
      requiresKey: false,
      fallbackModels,
    },
    async () => undefined,
  );

describe("context efficiency", () => {
  it("drops older complete turns without orphaning tool results or changing the current request", () => {
    const system: ChatMessage = { role: "system", content: "Instructions" };
    const old: ChatMessage[] = [
      { role: "user", content: "Old request" },
      { role: "assistant", content: "x".repeat(9000) },
      { role: "user", content: "Current request" },
    ];
    for (let index = 0; index < 6; index++)
      old.push(
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `t${index}`,
              type: "function",
              function: { name: "read_file", arguments: "{}" },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: `t${index}`,
          content: "large output ".repeat(500),
        },
      );
    const compact = compactMessages(system, old, 1200);
    expect(
      estimateTokens(JSON.stringify(compact.messages)),
    ).toBeLessThanOrEqual(1200);
    expect(compact.removed).toBeGreaterThan(0);
    expect(
      compact.messages.find((message) => message.role === "user")?.content,
    ).toBe("Current request");
    expect(compact.messages.at(-1)?.tool_call_id).toBe("t5");
    compact.messages.forEach((message, index) => {
      if (message.role === "tool")
        expect(
          compact.messages
            .slice(0, index)
            .some((item) =>
              item.tool_calls?.some((call) => call.id === message.tool_call_id),
            ),
        ).toBe(true);
    });
    expect(old.at(-1)?.content?.length).toBeGreaterThan(1800);
  });
  it("reports oversized standing instructions instead of silently truncating the user task", () => {
    expect(() =>
      compactMessages(
        { role: "system", content: "x".repeat(20000) },
        [{ role: "user", content: "Keep me" }],
        1024,
      ),
    ).toThrow("input token limit");
    expect(estimateTokens("🌱🌱🌱")).toBe(4);
    expect(
      normalizeBudget({ maxTokens: -10, maxOutputTokens: 100000 }),
    ).toMatchObject({ maxTokens: 1024, maxOutputTokens: 32000 });
  });
});
describe("compatible providers", () => {
  it("discovers real endpoint metadata and makes bounded keyless requests with cached usage", async () => {
    const calls: any[] = [];
    const baseUrl = await fixture((req, res, body) => {
      expect(req.headers.authorization).toBeUndefined();
      if (req.method === "GET")
        return json(res, {
          data: [
            {
              id: "vendor/free:free",
              name: "Free model",
              context_length: 32000,
              supported_parameters: ["tools"],
              pricing: { prompt: "0", completion: "0" },
            },
            { id: "paid", supported_parameters: [] },
          ],
        });
      calls.push(body);
      json(res, {
        choices: [
          { message: { content: "Bounded answer" }, finish_reason: "stop" },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 30 },
        },
      });
    });
    const modelList = await listModelDetails(
      baseUrl,
      "",
      new AbortController().signal,
    );
    expect(modelList).toContainEqual(
      expect.objectContaining({
        id: "vendor/free:free",
        free: true,
        supportsTools: true,
        contextWindow: 32000,
      }),
    );
    expect(modelList.find((model) => model.id === "paid")?.free).toBe(false);
    const history: ChatMessage[] = Array.from({ length: 7 }, (_, index) => [
      { role: "user" as const, content: `Old ${index}` },
      { role: "assistant" as const, content: "x".repeat(8000) },
    ]).flat();
    const f = await context(history);
    const result = await provider(baseUrl).run(f.ctx);
    expect(calls).toHaveLength(1);
    expect(calls[0].max_tokens).toBe(1024);
    expect(
      calls[0].messages.filter((m: ChatMessage) => m.role === "user").at(-1)
        .content,
    ).toBe(f.ctx.prompt);
    expect(
      estimateTokens(JSON.stringify(calls[0].messages)) +
        estimateTokens(JSON.stringify(calls[0].tools)),
    ).toBeLessThanOrEqual(6000);
    expect(result.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 30,
    });
    expect(
      f.events.some(
        (event) => event.type === "log" && event.text.includes("Compacted"),
      ),
    ).toBe(true);
  });
  it("estimates missing usage and prevents another model request after the token allowance is consumed", async () => {
    let calls = 0;
    const baseUrl = await fixture((_, res) => {
      calls++;
      json(res, {
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "tool",
                  type: "function",
                  function: { name: "list_files", arguments: "{}" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 100000, completion_tokens: 5 },
      });
    });
    const f = await context();
    await expect(provider(baseUrl).run(f.ctx)).rejects.toThrow("token budget");
    expect(calls).toBe(1);
    expect(f.events).toContainEqual(expect.objectContaining({ type: "usage" }));
    const estimateUrl = await fixture((_, res) =>
      json(res, {
        choices: [
          { message: { content: "No reported usage" }, finish_reason: "stop" },
        ],
      }),
    );
    expect(
      (await provider(estimateUrl).run((await context()).ctx)).usage?.estimated,
    ).toBe(true);
  });
  it("uses only explicitly configured same-endpoint fallbacks after retries and never on authentication errors", async () => {
    const models: string[] = [];
    const baseUrl = await fixture((_, res, body) => {
      models.push(body.model);
      if (body.model === "local-model") {
        res.writeHead(429, { "retry-after": "0.001" });
        res.end(JSON.stringify({ error: { message: "busy" } }));
      } else
        json(res, {
          choices: [
            { message: { content: "Fallback answer" }, finish_reason: "stop" },
          ],
        });
    });
    expect(
      (await provider(baseUrl, ["backup"]).run((await context()).ctx))
        .finalMessage,
    ).toBe("Fallback answer");
    expect(models).toEqual([
      "local-model",
      "local-model",
      "local-model",
      "local-model",
      "backup",
    ]);
    let rejectedCalls = 0;
    const authUrl = await fixture((_, res) => {
      rejectedCalls++;
      res.writeHead(401);
      res.end("{}");
    });
    await expect(
      provider(authUrl, ["backup"]).run((await context()).ctx),
    ).rejects.toThrow("API key");
    expect(rejectedCalls).toBe(1);
  });
});
describe("provider setup and secret boundaries", () => {
  it("normalizes pasted completion URLs, allows local profiles, and keeps encrypted keys out of metadata", async () => {
    const path = await fs.mkdtemp(join(tmpdir(), "dots-keys-"));
    cleanups.push(() => fs.rm(path, { recursive: true, force: true }));
    const cipher = {
      isAvailable: () => true,
      encrypt: (plain: string) =>
        Buffer.from(Buffer.from(plain).map((byte) => byte ^ 77)),
      decrypt: (blob: Buffer) =>
        Buffer.from(blob)
          .map((byte) => byte ^ 77)
          .toString(),
    };
    const creds = new CredentialStore(join(path, "credentials.bin"), cipher);
    const store = new ProviderStore(join(path, "providers.json"), creds);
    await store.init();
    const local = await store.save({
      label: "Local",
      baseUrl: "http://localhost:1234/v1/chat/completions/",
      defaultModel: "local",
      requiresKey: false,
    });
    expect(local).toMatchObject({
      hasKey: false,
      baseUrl: "http://localhost:1234/v1",
    });
    const remote = await store.save({
      label: "NIM",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      defaultModel: "model",
      apiKey: "secret-fixture",
      presetId: "nvidia",
    });
    expect(
      await fs.readFile(join(path, "providers.json"), "utf8"),
    ).not.toContain("secret-fixture");
    expect(
      (await fs.readFile(join(path, "credentials.bin"))).includes(
        Buffer.from("secret-fixture"),
      ),
    ).toBe(false);
    expect(await store.getApiKey(remote.id)).toBe("secret-fixture");
    await expect(
      store.save({ ...remote, baseUrl: "https://other.example/v1" }),
    ).rejects.toThrow("new key");
    expect(normalizeBaseUrl("https://router.example/api/v1/models")).toBe(
      "https://router.example/api/v1",
    );
    expect(() =>
      normalizeBaseUrl("https://router.example/v1?key=secret"),
    ).toThrow("without credentials");
  });
});
