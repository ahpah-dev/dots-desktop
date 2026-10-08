# Dots Desktop 2.1.0 — One goal, a team of Dots

This update adds coordinated team tasks, token controls, and guided setup for hosted routers and local models.

## Teamwork

- Choose two to eight Dots, write a goal, edit individual assignments, and choose a lead.
- Work in parallel, pass work along a sequence, or have the last Dot review earlier contributions.
- Dependencies receive completed results automatically. The lead produces one combined answer.
- Each Dot keeps its own provider, model, workspace, and permissions. Execution follows the existing concurrency setting and runs one task at a time per Dot.
- Follow live progress, inspect contributions, open conversations, and copy the final result.
- Stop a whole team task. Resume unfinished work while keeping successful contributions and cumulative usage; add token allowance when needed.
- Team plans and results persist locally. Restarted tasks are marked interrupted and wait for Resume.
- Coordinated assignments cannot start recursive teammate messages or wakeups. A worker failure blocks pending assignments before the next execution slot opens.

## Token efficiency

- Economy, Balanced, and Thorough presets in Profile → Model & computer and the new-Dot dialog.
- Context, response, task, duration, and tool-step allowances.
- API requests compact older conversation turns and long tool output, preserving the current user message and valid tool-call/result pairs.
- Compact memory and responsibility context; fresh conversations for team assignments and concise dependency handoffs.
- Input, output, cached, and estimated usage in conversations and team results.
- No extra model call is used to summarize old history.

## Easier API setup

- Eight presets: NVIDIA NIM, OpenRouter, Groq, Cerebras, Ollama, LM Studio, OpenAI API, and custom compatible routers.
- Key links, provider setup guides, sensible endpoint defaults, and pasted completion-URL normalization.
- Test unsaved settings and discover models before saving. Search available models, filter free models and confirmed tool support, and inspect context metadata.
- Keyless local endpoints, encrypted credentials, and saved-key reuse restricted to the original endpoint.
- Optional explicit fallback models at the same endpoint after rate-limit or service errors; retry progress is visible.
- Direct setup shortcuts from onboarding, Connections, and a Dot draft. Escape closes provider settings while preserving the draft.

## Validation

- TypeScript checks and production build passed.
- 71 unit tests passed; one existing Windows symlink test was skipped.
- The packaged Windows executable passed 20 new end-to-end checks using seven deterministic local API requests, including different providers, dependency review, lead synthesis, encrypted keys, token presets, cancellation/resume, and persisted results.
- Packaged regression checks passed for messaging defaults and replies, accessory colors and persistence, and the desktop companion's Open Dots behavior.
- The staged website passed 27 responsive, motion, and playback checks. Electron suites reported no renderer errors.
- Installer, portable executable, update metadata, blockmap, and SHA-256 checksums are included.

## Provider and execution limits

NVIDIA NIM offers trial access subject to its account limits and terms. OpenRouter's free router selects compatible free models, subject to provider limits; other model and fallback choices can be paid. Cloud account keys are supplied by the user. Connection tests list models rather than generating a completion or proving every model's tool support. Cloud configuration was checked against provider documentation and tested through compatible local fixtures; no live cloud credentials were used.

Token counts use reported usage when available and estimates otherwise. Context caps are estimated; task allowances stop subsequent work as usage arrives, and an in-flight request can exceed the remaining allowance. Codex manages its own context/output and reports usage separately. Teamwork runs on this computer while Dots is open; it does not add cloud hosting or cross-device sync.

Install the new Windows build over an earlier version to retain existing Dots, settings, and workspaces.
