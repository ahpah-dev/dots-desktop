import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACCESSORIES, DEFAULT_AVATAR, normalizeAvatar, shadeAvatarColor } from '@shared/avatar';
import { DEFAULT_PERMISSIONS, type DotAvatarConfig } from '@shared/types';
import { DotStore } from '../src/main/storage/dotStore';
import { Paths } from '../src/main/util/paths';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe('Avatar personalization', () => {
  it('keeps legacy avatars and their original accessory colors', () => {
    expect(normalizeAvatar()).toEqual(DEFAULT_AVATAR);
    for (const accessory of ['none', 'cap', 'sprout', 'headphones'] as const) {
      const legacy = { shape: 'blob', eyes: 'happy', glasses: 'round', accessory } as const;
      expect(normalizeAvatar(legacy)).toEqual(legacy);
    }
  });

  it('accepts all accessories and validates independent custom colors', () => {
    for (const [accessory] of ACCESSORIES) {
      expect(normalizeAvatar({ accessory, accessoryColor: '#AbC123', glassesColor: '#FEDCBA' }))
        .toMatchObject({ accessory, accessoryColor: '#abc123', glassesColor: '#fedcba' });
    }
    expect(normalizeAvatar({ accessory: 'unknown', accessoryColor: 'url(https://example.com)', glassesColor: '#abc' } as unknown as DotAvatarConfig)).toEqual(DEFAULT_AVATAR);
    expect(shadeAvatarColor('#000000', .3)).toBe('#4d4d4d');
    expect(shadeAvatarColor('#ffffff', -.22)).toBe('#c7c7c7');
  });

  it('persists accessories and colors across edits and restarts, including default resets', async () => {
    const directory = await fs.mkdtemp(join(tmpdir(), 'dots-avatar-'));
    directories.push(directory);
    const paths = new Paths(join(directory, 'data'));
    const store = new DotStore(paths);
    await store.init();
    const dot = await store.create({ name: 'Personalized Dot', color: '#78b7a0', emoji: '🌱', description: '', instructions: '', providerId: 'mock', model: 'auto', permissions: DEFAULT_PERMISSIONS, notify: false,
      avatar: { ...DEFAULT_AVATAR, accessory: 'crown', glasses: 'round', accessoryColor: '#FEBC45', glassesColor: '#4366AB' },
    }, join(directory, 'workspace'));
    await store.update(dot.id, { description: 'Keep my colors.' });
    const restarted = new DotStore(paths); await restarted.init();
    expect(restarted.require(dot.id).avatar).toEqual({ ...DEFAULT_AVATAR, accessory: 'crown', glasses: 'round', accessoryColor: '#febc45', glassesColor: '#4366ab' });
    await restarted.update(dot.id, { avatar: { ...restarted.require(dot.id).avatar!, accessory: 'none' } });
    expect(restarted.require(dot.id).avatar?.accessoryColor).toBe('#febc45');
    await restarted.update(dot.id, { avatar: { ...restarted.require(dot.id).avatar!, accessory: 'scarf', accessoryColor: undefined, glassesColor: undefined } });
    const reset = new DotStore(paths); await reset.init();
    expect(reset.require(dot.id).avatar).toEqual({ ...DEFAULT_AVATAR, accessory: 'scarf', glasses: 'round' });
    expect(reset.require(dot.id).color).toBe('#78b7a0');
  });
});
