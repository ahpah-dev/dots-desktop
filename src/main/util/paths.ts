import { join } from 'node:path';

/** All on-disk locations, rooted at a single data directory (Electron `userData`). */
export class Paths {
  constructor(public readonly root: string) {}

  get settings() { return join(this.root, 'settings.json'); }
  get providers() { return join(this.root, 'providers.json'); }
  get teams() { return join(this.root, 'teams.json'); }
  get credentials() { return join(this.root, 'credentials.bin'); }
  get logs() { return join(this.root, 'logs'); }
  get dots() { return join(this.root, 'dots'); }

  dotDir(id: string) { return join(this.dots, id); }
  dotFile(id: string) { return join(this.dotDir(id), 'dot.json'); }
  memoryFile(id: string) { return join(this.dotDir(id), 'memory.md'); }
  threadFile(id: string) { return join(this.dotDir(id), 'thread.json'); }
  conversationsDir(id: string) { return join(this.dotDir(id), 'conversations'); }
  conversationFile(id: string, conversationId: string) { return join(this.conversationsDir(id), `${conversationId}.json`); }
  workFile(id: string) { return join(this.dotDir(id), 'responsibilities.json'); }
  memoryNotesFile(id: string) { return join(this.dotDir(id), 'memory-notes.json'); }
  runsDir(id: string) { return join(this.dotDir(id), 'runs'); }
  runFile(dotId: string, runId: string) { return join(this.runsDir(dotId), `${runId}.json`); }
  runEventsFile(dotId: string, runId: string) { return join(this.runsDir(dotId), `${runId}.jsonl`); }
}

/** Reduce a display name to a safe single path segment. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 48);
  return s || 'dot';
}
