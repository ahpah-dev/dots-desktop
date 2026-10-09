<p align="center"><img src="assets/logo.svg" width="88" height="88" alt="Dots Desktop logo"></p>

# Dots Desktop 2.1

**Your work, moving forward.** Personal AI teammates with ongoing responsibilities, durable context, and a thoughtful desktop home.

[Download Windows installer](https://github.com/ahpah-dev/dots-desktop/releases/download/v2.1.0/Dots-Setup-2.1.0.exe) · [Portable build](https://github.com/ahpah-dev/dots-desktop/releases/download/v2.1.0/Dots-2.1.0-portable.exe) · [Website](https://dotsdesktop.vercel.app) · [Release notes](https://github.com/ahpah-dev/dots-desktop/releases/tag/v2.1.0)

![Dots Desktop conversation workspace](assets/desktop-screenshot-v2.0.1.png)

Dots Desktop is independent, open-source software inspired by [OpenAI Dots](https://learn.chatgpt.com/docs/dots). It runs locally and connects to your Codex installation or an OpenAI-compatible provider. It is not affiliated with OpenAI and does not include OpenAI's hosted Dots service. See the [capability comparison](docs/DOTS_PARITY.md) for the scope and remaining gaps.

## New in 2.1

- **Teamwork:** choose two to eight Dots, write one goal, and edit their assignments. Work in parallel, pass results along a sequence, or add a review step. Each Dot uses its own model, workspace, permissions, and token limits; the lead combines their answers. The coordinator handles dependencies, bounded concurrency, cancellation, and durable results. Resume unfinished assignments after interruption without repeating completed work.
- **Work style and token efficiency:** Economy directs a focused approach and one main check; Balanced covers requirements and likely failure cases; Thorough investigates alternatives, edge cases, and acceptance checks. Every API model and Codex turn receives concrete workflow and stopping instructions, including team assignments. The style persists separately from custom token limits. Automatic mode is the default, including for existing Dots: API requests retain tools past preset token or step counts, use provider response lengths, and expand the compaction target when the current task needs more context. Optional custom caps can be enabled in Profile. Large files can be written in chunks with append support. Time limits and cancellation remain available. Explicit team tasks retain their shared allowance. Older API history and long tool outputs are compacted while keeping the current request and valid tool-call/result pairs. Conversation and team views show input, output, cached, and estimated usage. Models can vary in instruction following; these workflows do not guarantee a fixed amount of work or replace explicit user requirements.
- **Guided API setup:** presets for 9router, NVIDIA NIM, OpenRouter (including `openrouter/free`), Groq, Cerebras, Ollama, LM Studio, OpenAI, and custom OpenAI-compatible routers. Follow the key link, paste your key, discover available models, filter free models and confirmed tool support, and test before saving. Local servers can connect without a key. Optional fallback models stay at the same endpoint; keys remain encrypted by Windows.
- **Faster setup:** API setup is available directly from onboarding, Connections, and the new-Dot dialog. Teamwork is in the sidebar and command palette, and completed team answers appear above assignment details.

### Use a team

Open **Teamwork**, describe a goal, select at least two resumed Dots with **Talk to other dots** enabled, choose a lead and a work pattern, then edit the assignments and start. Follow live progress or open each conversation. **Stop team task** cancels running and queued assignments. **Resume unfinished work** keeps successful contributions and can add token allowance. Different workspaces are independent: exchange results or file paths explicitly when the task needs them.

### Connect a router or local model

Open **Settings → Model providers → Add provider**. Choose a preset, use **Get API key** where needed, paste the key, then **Test connection & discover models**. Select a model and save. Pick that provider in a Dot's **Profile → Model & computer**, or while creating a Dot. For Ollama or LM Studio, start the local server and load a tool-capable model first.

NVIDIA provides [trial API access](https://docs.api.nvidia.com/nim/docs/introduction), subject to its account limits and [trial terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf). OpenRouter's [free router](https://openrouter.ai/openrouter/free) selects compatible free models; [provider rate limits](https://openrouter.ai/pricing/) apply. Other models and fallback choices can be paid. Connection tests discover models; they do not make a chat-completion request or prove every model's tool support. Live cloud credentials are not included.

**9router:** Choose its preset, or name an existing local profile “9router”. At the standard local endpoint (`http://localhost:20128/v1`), Dots also uses the installed 9router CLI’s authenticated, read-only catalog client. This includes OpenCode Free and every catalog model, even when `/v1/models` lists only connected providers. Models that still need router setup are labeled **Enable in 9router**. The list has no 60-result cutoff; profile and new-Dot pickers have **Refresh models**. Remote routers and installations without the CLI use the normal API model list. Catalog access does not make chat requests or expose router credentials to the renderer.

Token counts use provider usage when available, otherwise a UTF-8 based estimate. Input context caps are estimates, and total allowances stop subsequent requests as usage arrives; in-flight requests can exceed the remaining allowance. Codex controls its own context and output, and its total limit can be enforced only when it reports usage. Team jobs recover as interrupted after an app restart and require an explicit Resume.

## Desktop features

- **A complete new home:** Overview, an attention inbox, global activity, and connections bring your teammates and their work together. Search and a command palette keep navigation quick.
- **A character of their own:** Choose from eleven accessories, including hats, a crown, a flower, a scarf, and headphones. Set accessory and glasses colors independently with presets or a custom color in Profile → Personalization, then save. A calm sage and cream interface, refined dark mode, and responsive layouts keep each dot at home.
- **Live activity with a little personality:** File work, web searches, commands, and connected tools have gentle activity animations in your conversation and on your dot.
- **A teammate on your desktop:** Minimize Dots or close it to the tray to see a draggable, always-on-top dot with live updates. Open its conversation, stop a task, switch teammates, or turn on spoken updates. Settings → Desktop also offers an always-visible mode.
- **Conversations that stay organized:** Keep separate conversations with the same dot. Messages sent while it works queue up instead of interrupting an active task.
- **Edit and revert your messages:** Use Edit → Save & resend or Revert here beneath a sent message. A new branch keeps earlier turns and excludes later replies; the original stays in Conversations. Files, memory, and scheduled work remain. Finish or stop active work first.
- **Ongoing responsibilities:** Give a dot multiple recurring jobs. Manage timing, instructions, and run history independently from its conversations.
- **Follow-ups with a purpose:** Save durable wakeups so a dot can return to work later while the app is running.
- **Memory you can inspect:** Keep structured notes about preferences, decisions, and ongoing work alongside each dot's existing memory.
- **Clearer control:** Review approvals and apply custom rules to supported tools, with explicit boundaries for Codex-backed work.

## Getting started

1. Install [Dots-Setup-2.1.0.exe](https://github.com/ahpah-dev/dots-desktop/releases/download/v2.1.0/Dots-Setup-2.1.0.exe). Run the installer over an earlier version to keep local dots, settings, and workspaces.
2. Connect a model provider in Settings.
3. Create a dot, give it a purpose, and choose a local workspace.
4. Start a conversation or add an ongoing responsibility. Review activity and approvals as work progresses.

Windows 10 or 11 (x64) is required for the published installer. The application is free; provider charges and account usage limits still apply.

### Connect a provider

**OpenAI Codex:** Install and authenticate the [official Codex CLI](https://developers.openai.com/codex/cli/). Dots discovers the local executable, uses its app-server for authentication and model discovery, and runs tasks through `codex exec --json`. Sign-in stays with Codex; Dots does not extract OAuth tokens. Available models depend on your account and configuration.

**OpenAI-compatible API:** Add the endpoint, model, and optional API key in Settings. Keys are encrypted with Electron's operating-system credential storage. Compatible providers can include hosted APIs or local model servers; tool support depends on the model and endpoint.

## How work runs

### Let dots talk to each other

**Talk to other dots** is enabled by default for new Dots. Upgrading to 2.1.0 enables it once for existing Dots too. You can turn it off in **Profile → Permissions** and save; that choice persists across restarts. The option is also available when creating a Dot.

Then ask a dot to consult a teammate, for example: “Ask Researcher to check these facts, then use its answer to finish the brief.” A busy teammate queues the request. Its answer returns as a labeled turn in the original conversation, and each participant uses its own permissions, workspace, model and task budget. API providers use messaging tools; Codex requests delivery through a structured final block handled by the app.

Automatic exchanges are limited to three requests per run, eight requests per exchange and four message hops including replies. Stopping the originating run cancels its pending teammate work. Only enabled, unpaused teammates can receive new requests.

Each dot has its own instructions, workspace, model, budget, and memory. Dots provides local file and shell tools, web search and fetch, background schedules, persistent run history, and human approval controls. Different dots can work concurrently within the configured limit; jobs for the same dot run one at a time so they do not mutate its workspace together. Finished results can be read aloud when system speech synthesis is available.

Closing the window keeps Dots in the system tray when background mode is enabled. **Your computer must be on and the app must be running** for tasks, routines, and wakeups to execute. Dots Desktop does not provide a cloud computer, mobile sync, official ChatGPT memory access, Slack/Teams messaging, or full voice calls.

Custom tool rules and interactive approvals are enforced directly for OpenAI-compatible providers. The headless Codex runner rejects a dot configured with approval mode `ask` or any custom `ask`/`deny` rule before execution, because it cannot enforce those decisions on each Codex tool call. Use a compatible provider for those controls. Supported Codex execution uses its configured sandbox; enabling outside-workspace access bypasses Codex's sandbox and approvals.

Built-in file tools validate workspace boundaries. The compatible provider's native shell tool runs commands with your computer's privileges and is **not an operating-system sandbox**; a command can access files beyond its working folder. Disable shell access or require approvals when that access is unsuitable.

## Local data and permissions

Dots stores profiles, conversations, run events, settings, and memory locally. Workspaces are ordinary folders that you can inspect and keep using outside the app. Model requests send the context needed for a task to the selected provider.

- Separate file, shell, web, and outside-workspace permissions per dot.
- Run budgets, cancellation, approvals, and reviewable activity.
- Codex reports token usage after a turn completes. Completed answers retain their successful status even if reported usage exceeds the prompted allowance; compatible API providers stop starting new requests at a task limit only when custom caps are enabled.
- Encrypted API credentials using Electron `safeStorage`.
- Workspace checks and private-network filtering for built-in tools.
- Optional loading of your Codex configuration for your own tools and integrations.

## Development

Use Node.js 22.12+ or another version supported by the installed Vite and Electron tooling.

```powershell
npm install
npm run dev
```

```powershell
npm test
npm run build
```

Run the Electron smoke workflow after building:

```powershell
npm run test:smoke
npm run test:desktop-dot
npm run test:teamwork
node scripts/panel-smoke.mjs
```

The smoke workflow uses Playwright with the real Electron renderer, preload bridge, IPC services, and a local deterministic OpenAI-compatible fixture. It checks conversations, tool output, memory, wakeups, responsibilities, approvals, cancellation, navigation, and themes without external provider credentials or paid model calls. The panel script additionally checks avatar and rule persistence, memory editing/deletion, scheduling, dot creation, and settings keyboard controls. Demo data is isolated from your normal dots. Screenshots and results are written to `artifacts/qa/`.

Release 2.0.0 validation: 32 unit tests passed, with one Windows symlink test skipped. Both Playwright suites also passed against the **packaged Windows executable**: 26 end-to-end checks using seven actual local-provider requests, plus avatar/rule persistence, memory create/edit/delete, schedule persistence, dot creation, live themes, and Escape controls. Both suites reported zero renderer errors. The published installer and portable build come from that tested package, with SHA-256 checksums included in the release.

Package a Windows installer and portable executable:

```powershell
npm run dist
```

Artifacts are generated under `release/`: `Dots-Setup-2.1.0.exe` and `Dots-2.1.0-portable.exe`. Packaged macOS and Linux targets are configured but are not included in this Windows release.

## Website and demo film

The website includes scroll reveals, interactive characters and cards, and a 76-second promotional film. Fresh v2.0.4 footage shows live tool activity and the desktop dot keeping you posted while the main window is minimized. Playback starts on request with native controls, six chapter shortcuts, English captions, and a transcript. Reduced-motion preferences keep the content visible without automatic motion. The film combines real app screens, original motion graphics, and an original synth score.

To regenerate the media and verify the player:

```powershell
npm run build
npm run media:capture
node scripts/capture-promo-activity.mjs
npm run media:render
npm run test:website
```

Media is saved under `website/assets/`. Activity capture uses an isolated demo workspace and a local example provider; it performs real file and command actions without paid model calls. Test `DOTS_WEBSITE_URL` can point to the deployed site for the same playback checks. Rendering uses the development-only Canvas and FFmpeg packages; they are not included in the website or desktop installer.

## Project structure

| Folder | Responsibility |
| --- | --- |
| `src/shared` | Domain models, IPC contracts, scheduling helpers |
| `src/main` | Persistence, provider drivers, execution, tools, scheduling |
| `src/preload` | Isolated bridge between Electron and the renderer |
| `src/renderer` | React interface and design system |
| `tests` | Scheduling, engine, and safety checks |
| `website` | Static product site deployed to the existing Vercel project |
| `docs` | Capability comparison and product boundaries |

## License

[MIT](LICENSE). OpenAI, ChatGPT, and Codex are trademarks of their respective owners.
