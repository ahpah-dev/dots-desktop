# Changelog

## 2.0.4 — October 7, 2026

- File work, web searches, shell commands, memory updates, and connected tools have their own gentle activity animations in the conversation and dot profile.
- Added a draggable, always-on-top desktop dot with live speech bubbles when Dots is minimized or closed to the tray. It follows active work and approval requests, with controls to reopen the right conversation, stop work, and switch teammates.
- Desktop settings offer background-only or always-visible mode, saved screen position, and optional spoken updates, which are off by default. Hide the dot from its close button and restore it from Settings or the system tray.
- The companion uses a restricted bridge and displays short activity summaries. Hidden windows pause animation, reduced motion disables it, and live updates are batched without retaining tool arguments or output.
- Closing with background mode disabled quits the app even if the desktop dot is visible.

## Website — October 6, 2026

- Added scroll reveals, pointer-responsive cards and characters, gentle ambient motion, and reduced-motion support.
- Added a 58-second promotional film with original motion graphics, app screens, and original music.
- Added native playback controls, chapter shortcuts, English captions, and a readable transcript. Video downloads only when played.

## Website — October 7, 2026

- Extended the trailer to 76 seconds with fresh v2.0.4 footage, animated tool activity, and a live desktop companion demonstration. Added chapter shortcuts and captions for both new features, with ten scenes and continuous transitions.
- Chapter shortcuts now honor the latest selection even while an earlier seek is still loading.

- Fixed the demo film's scene transitions so incoming animations continue through each dissolve without appearing early and restarting.
- Removed pointer-driven parallax, card tilt and moving gradients, large-grid animation, and blurred text entrances.
- Shortened scroll reveals, paused decorative motion during scrolling and offscreen, and disabled continuous decoration on mobile and touch devices.
- Replaced JavaScript scroll-progress layout reads with a native CSS scroll timeline where supported.

## 2.0.3 — October 7, 2026

- Dots blink and breathe, greet you on hover or keyboard focus, and show gentle working, waiting, and approval motions. Paused dots rest.
- Animated avatars share one visibility observer. Decorative motion pauses offscreen, during scrolling, and when the app is hidden or unfocused; reduced motion disables it.
- Website teammates give a brief greeting on arrival and wink when clicked or activated with the keyboard, with a small desktop hero sparkle. Large backgrounds and mobile idle decoration remain static.

## 2.0.2 — October 6, 2026

- Edit your sent messages inline and save & resend from that point.
- Revert here resends an earlier message in a separate conversation branch; the original remains available in Conversations.
- Earlier messages carry over, while later replies and provider sessions are excluded from the new branch. Branches persist across app restarts.
- Conversation revisions keep existing files, saved memory, and scheduled work. Finish or stop active work before revising a message.

## 2.0.1 — October 6, 2026

- Unified sage-and-cream four-dot logo across the app, Windows icons, tray, website, and GitHub README.
- Fresh conversation workspace screenshot on GitHub and the website.

## 2.0.0 — October 6, 2026

A substantial redesign around persistent teammates and ongoing work.

- New sage and cream design system, polished dark theme, personalized dot characters, responsive layouts, and keyboard navigation.
- Overview, attention inbox, global activity, connections, and a command palette.
- Independent conversations and queued messages per dot.
- Multiple ongoing responsibilities with their own recurring schedules.
- Durable wakeups for follow-up work while Dots is running.
- Structured memory cards for preferences, decisions, and ongoing work.
- Custom tool rules for supported provider execution, with clear Codex enforcement limits.
- Refreshed website, documentation, and Windows installer/portable distribution.
- Documented the distinction between local execution and OpenAI Dots' hosted infrastructure.

Existing local dots, workspaces, and settings are retained when upgrading.

## 1.0.6

- Theme-matched Windows title bar and window controls.
- Refined tabs, selection, hover states, focus, and text contrast.
- Dialog and tab animations with reduced-motion support.
- System-theme updates while the app is open.
