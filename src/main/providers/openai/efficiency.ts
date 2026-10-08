import { estimateTokens } from "@shared/budget";
import type { ChatMessage } from "./chat";
import { ProviderError } from "../types";
import { clip } from "../../util/misc";

/** A compaction target is a preference in automatic mode, never a reason to reject a valid tool turn. */
export function compactAdaptiveMessages(system: ChatMessage, history: ChatMessage[], target: number, extraTokens = 0) {
  let limit = target;
  for (;;) {
    try { return compactMessages(system, history, limit, extraTokens); }
    catch (error) {
      if (!(error instanceof ProviderError) || limit >= 128_000) throw error;
      limit = Math.min(128_000, limit * 2);
    }
  }
}

/** Compact complete turns/tool groups, without a second, billable summarization request. */
export function compactMessages(
  system: ChatMessage,
  history: ChatMessage[],
  maxTokens: number,
  extraTokens = 0,
): { messages: ChatMessage[]; removed: number } {
  const lastUser = history.findLastIndex((message) => message.role === "user");
  let removed = 0;
  const messages = history.map((message, index) => ({
    ...message,
    content:
      message.content == null
        ? null
        : index === lastUser
          ? message.content
          : clip(message.content, message.role === "tool" ? 1800 : 6000),
  }));
  const size = () =>
    estimateTokens(JSON.stringify([system, ...messages])) + extraTokens;
  while (size() > maxTokens) {
    const userIndices = messages.flatMap((message, index) =>
      message.role === "user" ? [index] : [],
    );
    if (userIndices.length > 1) {
      removed += userIndices[1];
      messages.splice(0, userIndices[1]);
      continue;
    }
    // Retain the current user request and the newest assistant/tool group.
    const first = messages.findIndex((message) => message.role === "assistant");
    if (first < 0) break;
    let next = first + 1;
    while (next < messages.length && messages[next].role === "tool") next++;
    if (next >= messages.length) break;
    removed += next - first;
    messages.splice(first, next - first);
  }
  if (size() > maxTokens) {
    for (const message of messages)
      if (message.role === "tool" && message.content)
        message.content = clip(message.content, 320);
  }
  if (size() > maxTokens)
    throw new ProviderError(
      "This message and its standing context exceed the input token limit. Choose a larger context budget in Profile → Model & computer, or shorten the message.",
    );
  if (removed) {
    const note: ChatMessage = {
      role: "assistant",
      content:
        "Earlier completed turns were omitted to fit the context budget. The current request and recent tool results are retained; consult files when details are needed.",
    };
    if (
      estimateTokens(JSON.stringify([system, note, ...messages])) +
        extraTokens <=
      maxTokens
    )
      messages.splice(
        messages.findIndex((message) => message.role === "user") + 1,
        0,
        note,
      );
  }
  return { messages: [system, ...messages], removed };
}
