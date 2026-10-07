/** Local-only deterministic OpenAI-compatible fixture for the Electron smoke test. */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export async function startQaProvider({ port = 0, chunkDelayMs = 25 } = {}) {
  const calls = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (request.method === "GET" && path === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "qa-model", object: "model" }],
        }),
      );
      return;
    }
    if (request.method !== "POST" || path !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: {
            message:
              "This QA fixture supports /v1/models and /v1/chat/completions only.",
          },
        }),
      );
      return;
    }
    try {
      let raw = "";
      for await (const chunk of request) {
        raw += chunk;
        if (raw.length > 2_000_000)
          throw new Error("Fixture request too large.");
      }
      const body = JSON.parse(raw);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const lastUserIndex = messages.findLastIndex(
        (message) => message.role === "user",
      );
      const userPrompt = messages[lastUserIndex]?.content ?? "";
      const toolResults = messages
        .slice(lastUserIndex + 1)
        .filter((message) => message.role === "tool");
      const available = new Set(
        (body.tools ?? []).map((tool) => tool.function.name),
      );
      calls.push({
        messages,
        path,
        model: body.model,
        userPrompt,
        toolResults: toolResults.map((message) => message.content),
      });
      if (String(userPrompt).includes("[qa:slow]")) await sleep(1500);
      if (response.destroyed) return;
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const send = (delta, finish_reason = null) => {
        if (!response.destroyed)
          response.write(
            `data: ${JSON.stringify({ id: "qa-completion", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
          );
      };
      const requested = [];
      if (!toolResults.length && available.size) {
        if (available.has("write_file"))
          requested.push({
            name: "write_file",
            args: {
              path: "qa-output.txt",
              content: "Checked the complete Dots tool workflow.\n",
            },
          });
        if (String(userPrompt).includes("[qa:command]") && available.has("run_command"))
          requested.push({
            name: "run_command",
            args: { command: process.platform === "win32" ? "Start-Sleep -Milliseconds 3000; Write-Output 'desktop-dot-check'" : "sleep 3; printf desktop-dot-check", timeout_seconds: 15 },
          });
        if (available.has("remember"))
          requested.push({
            name: "remember",
            args: {
              note: "QA fixture: writes, memories, and wakeups are verified locally.",
            },
          });
        const alreadyScheduled = messages.some((message) =>
          message.tool_calls?.some(
            (call) => call.function.name === "schedule_followup",
          ),
        );
        if (available.has("schedule_followup") && !alreadyScheduled)
          requested.push({
            name: "schedule_followup",
            args: {
              prompt:
                "Check qa-output.txt and report whether the local QA artifact is still present.",
              due_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
          });
      }
      if (requested.length) {
        send({
          role: "assistant",
          content: "I’ll verify the workspace, memory, and persistent wakeup.",
        });
        await sleep(chunkDelayMs);
        for (const [index, tool] of requested.entries()) {
          const args = JSON.stringify(tool.args);
          const midpoint = Math.floor(args.length / 2);
          send({
            tool_calls: [
              {
                index,
                id: `qa-${calls.length}-${index}`,
                type: "function",
                function: {
                  name: tool.name,
                  arguments: args.slice(0, midpoint),
                },
              },
            ],
          });
          await sleep(chunkDelayMs);
          send({
            tool_calls: [
              { index, function: { arguments: args.slice(midpoint) } },
            ],
          });
        }
        send({}, "tool_calls");
      } else {
        const failures = toolResults.filter((message) =>
          String(message.content).startsWith("Error:"),
        );
        const summary = failures.length
          ? `The local QA turn finished with ${failures.length} tool action(s) declined or blocked. Review the activity details.\n\n${failures.map((message) => message.content).join("\n")}`
          : "The local QA workflow is complete. The workspace artifact, durable memory, and one-time wakeup are ready to review.";
        for (const text of summary.match(/.{1,32}/gs) ?? []) {
          send({ content: text });
          await sleep(chunkDelayMs);
        }
        send({}, "stop");
      }
      response.write(
        `data: ${JSON.stringify({ id: "qa-completion", choices: [], usage: { prompt_tokens: 120, completion_tokens: 45 } })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    } catch (error) {
      if (!response.headersSent)
        response.writeHead(400, { "content-type": "application/json" });
      if (!response.destroyed)
        response.end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    calls,
    server,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const fixture = await startQaProvider({ port: Number(process.argv[2]) || 0 });
  process.stdout.write(
    `${JSON.stringify({ baseUrl: fixture.baseUrl, model: "qa-model", apiKey: "local-qa-fixture", fixture: true })}\n`,
  );
  process.on("SIGINT", async () => {
    await fixture.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await fixture.close();
    process.exit(0);
  });
}
