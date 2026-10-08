# OpenAI Dots capability comparison

Researched against official OpenAI documentation on October 6, 2026. Dots Desktop 2.1 is independent software. This comparison describes product behavior and implementation boundaries; it does not claim access to OpenAI's private service, APIs, or account data.

## Desktop experience

| Capability | OpenAI Dots reference | Dots Desktop 2.1 |
| --- | --- | --- |
| Personal agent identity | Name and configurable appearance. [Meet dots](https://learn.chatgpt.com/docs/dots) | Multiple named dots with personalized appearance, purpose, and instructions. |
| Ongoing work | Responsibilities carry across interactions. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | Separate conversations, multiple responsibilities, persistent task history, and queued follow-up messages. |
| Recurring work | Saved schedules for fixed timing. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | Interval, daily, and cron scheduling with reviewable local run history. |
| Self-directed follow-up | Agents can pause and resume later. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | Durable wakeups that return to work while the app is running. |
| Persistent notes | Preferences and decisions carry forward. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | Editable local memory and structured notes about preferences, decisions, and ongoing work. |
| Activity review | Inspect progress, files, and decisions. [Controls](https://learn.chatgpt.com/docs/dots/controls) | Overview, global activity, per-dot run timelines, files, and an attention inbox. |
| Rules and approvals | Custom rules supplement safeguards. [Controls](https://learn.chatgpt.com/docs/dots/controls) | Built-in compatible-provider tools enforce custom rules. Codex execution is rejected before dispatch if approval mode is `ask` or any custom rule has `ask`/`deny`, rather than pretending those controls can intercept Codex actions. |
| Stop and pause controls | Main work, delegated work, and schedules have separate controls. [Controls](https://learn.chatgpt.com/docs/dots/controls) | Cancel tasks or whole team jobs, pause a dot, disable routines, and remove pending wakeups separately. |
| Local files and tools | A connected computer supplies local resources. [Computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) | Direct local workspace, shell, file, and network tools with configured permissions. |
| Parallel work | Background agents handle independent work. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | Teamwork supports parallel assignments, sequential handoffs, review steps, and a lead synthesis. Dependency graphs, results, interruption recovery, group cancellation, and token allowances are persisted locally. Different dots can run concurrently; work for a single dot is serialized. |
| Read results aloud | Desktop result convenience, distinct from a voice call. | Finished results can be read aloud when system speech synthesis is available. This does not provide a conversational voice session. |

## Infrastructure-dependent gaps

| Capability | OpenAI Dots reference | What is required beyond this release |
| --- | --- | --- |
| Always available with the computer off | Hosted agent and computer. [Meet dots](https://learn.chatgpt.com/docs/dots) | A deployed agent runtime, durable job queue, identity, billing, and remote storage. Current tasks run only while the desktop app runs. |
| Persistent cloud computer and browser | Remote state and takeover controls. [Computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) | Provisioned virtual machines, session isolation, streaming, browser authentication, and takeover controls. Local web tools are not cloud computer access. |
| ChatGPT memory and conversations | Relevant account context. [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory) | Authorized account APIs and a supported data path. Local notes do not read private ChatGPT memory or unrelated conversations. |
| Mobile and cross-device access | Supported ChatGPT clients. [Meet dots](https://learn.chatgpt.com/docs/dots) | User identity, secure sync, remote API, and mobile/web clients. |
| Slack and Teams continuity | Contact methods for the same dot. [Messaging](https://learn.chatgpt.com/docs/dots/channels) | Registered messaging apps, OAuth, webhook hosting, audience controls, and shared conversation context. No bundled messaging transport is included. |
| Full voice calls | Talk while assigned work continues. [Messaging](https://learn.chatgpt.com/docs/dots/channels) | Realtime audio transport, model access, microphone controls, interruption handling, and voice session orchestration. |
| Hosted plugin connections | Connected accounts and permissions. [Computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) | Per-provider integrations and account consent. A local Codex configuration can expose the user's configured tools; it does not inherit ChatGPT plugins. |
| Automatic action review and governance | Built-in review and workspace controls. [Controls](https://learn.chatgpt.com/docs/dots/controls) | A separate policy and review service, audit infrastructure, and enterprise administration. Local permissions and rules are narrower mechanisms. |
| Private browser sign-in and saved passwords | Dedicated remote sign-in flow. [Computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps) | A credential vault and remote browser handoff. Dots Desktop's provider credential storage does not provide that flow. |

## Operational limits

The installed app must remain running on a powered-on computer. Closing to the tray keeps it active when background mode is enabled. Suspend, shutdown, loss of network, provider limits, or expired authentication can delay work. A finished run records completion of the provider turn; inspect its result to confirm the requested outcome.

Codex-backed work uses `codex exec --json`; the app-server is used for authentication and model discovery. Headless Codex execution cannot handle Dots' interactive approvals or custom ask/deny rules, so these configurations are rejected before a task executes. Permitted Codex runs use the configured Codex sandbox; outside-workspace access bypasses it.

Compatible-provider work uses Dots Desktop's own tool loop. Its file tools validate workspace boundaries, and its native shell tool runs with local computer privileges rather than an operating-system sandbox. Granting shell access does not confine commands to the workspace. Different dots can run concurrently, while one dot's jobs execute sequentially.

Cloud availability, messaging, full voice calls, and account sync are genuine product gaps. This release exposes those boundaries rather than presenting inactive controls as working integrations.

## Official sources

- [Meet dots](https://learn.chatgpt.com/docs/dots)
- [Get started with your dot](https://learn.chatgpt.com/docs/dots/getting-started)
- [Tasks and memory](https://learn.chatgpt.com/docs/dots/tasks-and-memory)
- [Connect computers and apps](https://learn.chatgpt.com/docs/dots/computers-and-apps)
- [Message your dot](https://learn.chatgpt.com/docs/dots/channels)
- [Control your dot](https://learn.chatgpt.com/docs/dots/controls)
