# Dots Desktop 2.0 — Your work, moving forward

Dots 2.0 rebuilds the desktop experience around personal teammates and ongoing work. A calm new interface brings your dots, conversations, responsibilities, memory, and decisions into one home.

- **A new workspace:** Overview, attention inbox, global activity, connections, responsive light/dark themes, and a command palette.
- **Personalized teammates:** Configurable dot characters, identities, and instructions.
- **Organized conversations:** Independent conversations and queued messages while a dot is working.
- **Ongoing responsibilities:** Multiple recurring jobs per dot, each with its own instructions and timing.
- **Durable follow-ups:** Wakeups for returning to work later while Dots runs.
- **Inspectable memory:** Structured cards for preferences, decisions, and ongoing work alongside existing local memory.
- **Clearer permissions:** Custom rules for supported tools and explicit Codex policy limitations.
- **Read results aloud:** Optional system speech synthesis for finished results.
- **A refreshed website and documentation:** Including a cited comparison with official OpenAI Dots.

## Download

- **Dots-Setup-2.0.0.exe:** Windows x64 installer. Run it over an existing installation to retain local dots, settings, and workspaces.
- **Dots-2.0.0-portable.exe:** Windows x64 portable executable.
- **SHA256SUMS-2.0.0.txt:** SHA-256 checksums for the downloadable executables.

Dots Desktop is independent, open-source software inspired by OpenAI Dots. Execution is local: your computer must be powered on and the app must be running. OpenAI's hosted cloud computer, ChatGPT memory, cross-device channels, Slack/Teams messaging, and full voice calls are not bundled. Provider usage charges and account limits still apply.

See [the capability comparison](https://github.com/ahpah-dev/dots-desktop/blob/main/docs/DOTS_PARITY.md) for the documented scope.

Custom ask/deny rules and interactive approvals require an OpenAI-compatible provider; headless Codex execution rejects those configurations before running. Built-in file tools enforce workspace boundaries, while the compatible provider's native shell commands run with local computer privileges rather than an operating-system sandbox. Different dots can work concurrently; jobs within one dot execute sequentially.

## Validation

- 32 unit tests pass, including persistence, conversation isolation, permission rules, wakeup recovery, cancellation, and scheduler fairness; one Windows symlink test is skipped on this system.
- The **packaged Windows executable** passes 26 end-to-end checks through the actual Electron renderer, preload bridge, IPC services, and compatible-provider tool loop, with seven actual local-provider requests and zero renderer errors.
- The local deterministic provider exercises file creation, memory, durable follow-ups, approvals, queued work, cancellation, and conversation continuation without external credentials or paid model calls.
- The packaged panel suite also passes avatar/rule persistence, memory create/edit/delete, schedule persistence, new-dot navigation, live theme changes, and Escape controls, with zero renderer errors.
- Desktop and mobile website checks cover responsive layout, image loading, keyboard navigation, and screenshot dialogs.
- Installer and portable downloads were generated from the tested package. Packaged resources contain no Playwright or development `node_modules`; SHA-256 checksums are included.
