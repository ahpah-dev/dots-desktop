import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PERMISSIONS, type DotInput } from '@shared/types';
import { DotStore } from '../src/main/storage/dotStore';
import { Paths } from '../src/main/util/paths';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const directory = await fs.mkdtemp(join(tmpdir(), 'dots-messaging-defaults-'));
  directories.push(directory);
  const paths = new Paths(join(directory, 'data'));
  const store = new DotStore(paths); await store.init();
  const input: DotInput = { name: 'Default messaging', description: 'Keep my profile', color: '#567fba', emoji: '🌱', instructions: 'Keep my instructions', providerId: 'mock', model: 'auto', notify: false,
    permissions: { ...DEFAULT_PERMISSIONS, files: 'read', shell: false, web: false },
    avatar: { shape: 'blob', eyes: 'happy', glasses: 'round', accessory: 'crown', accessoryColor: '#dd4488' },
  };
  return { paths, store, input, workspace: join(directory, 'workspace') };
}

describe('Messaging defaults and upgrades', () => {
  it('enables new Dots when the permission is omitted and retains an explicit opt-out', async () => {
    const f = await fixture();
    const omitted = { ...f.input.permissions }; delete omitted.talkToDots;
    const defaultDot = await f.store.create({ ...f.input, permissions: omitted }, f.workspace);
    const offDot = await f.store.create({ ...f.input, name: 'Opted out', permissions: { ...f.input.permissions, talkToDots: false } }, f.workspace);
    expect(defaultDot.permissions.talkToDots).toBe(true);
    expect(offDot.permissions.talkToDots).toBe(false);
    const restarted = new DotStore(f.paths); await restarted.init();
    expect(restarted.require(defaultDot.id).permissions.talkToDots).toBe(true);
    expect(restarted.require(offDot.id).permissions.talkToDots).toBe(false);
  });

  it('enables previously saved Dots with missing, false or true permissions without altering their profile', async () => {
    const f = await fixture();
    for (const oldValue of [undefined, false, true]) {
      const dot = await f.store.create(f.input, f.workspace);
      const legacy = { ...dot, permissions: { ...dot.permissions, talkToDots: oldValue } };
      delete legacy.talkToDotsDefaultVersion;
      await fs.writeFile(f.paths.dotFile(dot.id), JSON.stringify(legacy));
      const migrated = new DotStore(f.paths); await migrated.init();
      const upgraded = migrated.require(dot.id);
      expect(upgraded).toEqual({ ...dot, permissions: { ...dot.permissions, talkToDots: true } });
      const saved = JSON.parse(await fs.readFile(f.paths.dotFile(dot.id), 'utf8'));
      expect(saved.talkToDotsDefaultVersion).toBe(1);
      expect(saved.permissions.talkToDots).toBe(true);
    }
  });

  it('applies the upgrade only once so a later opt-out survives edits and repeated restarts', async () => {
    const f = await fixture();
    const dot = await f.store.create(f.input, f.workspace);
    const legacy = { ...dot, permissions: { ...dot.permissions, talkToDots: false } };
    delete legacy.talkToDotsDefaultVersion;
    await fs.writeFile(f.paths.dotFile(dot.id), JSON.stringify(legacy));
    const upgraded = new DotStore(f.paths); await upgraded.init();
    expect(upgraded.require(dot.id).permissions.talkToDots).toBe(true);
    await upgraded.update(dot.id, { permissions: { ...dot.permissions, talkToDots: false } });
    await upgraded.update(dot.id, { description: 'New description' });
    for (let i = 0; i < 2; i++) {
      const restarted = new DotStore(f.paths); await restarted.init();
      expect(restarted.require(dot.id).permissions.talkToDots).toBe(false);
      expect(restarted.require(dot.id).description).toBe('New description');
    }
  });
});
