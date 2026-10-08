import type { DotAvatarConfig } from './types';

export const DEFAULT_AVATAR: DotAvatarConfig = {
  shape: 'circle', eyes: 'dot', glasses: 'none', accessory: 'none',
};

export const ACCESSORIES: [DotAvatarConfig['accessory'], string][] = [
  ['none', 'None'], ['cap', 'Cap'], ['sprout', 'Sprout'], ['headphones', 'Headphones'],
  ['beanie', 'Beanie'], ['bow', 'Bow'], ['crown', 'Crown'], ['flower', 'Flower'],
  ['antenna', 'Antenna'], ['party-hat', 'Party hat'], ['scarf', 'Scarf'], ['top-hat', 'Top hat'],
];

export const ACCESSORY_DEFAULT_COLORS: Record<DotAvatarConfig['accessory'], string> = {
  none: '#465f51', cap: '#465f51', sprout: '#577954', headphones: '#415b4b',
  beanie: '#8b94b8', bow: '#dba9ba', crown: '#e5c77d', flower: '#dea88d',
  antenna: '#93b5d5', 'party-hat': '#b7a3d6', scarf: '#bc7181', 'top-hat': '#394c42',
};

export function normalizeAvatar(avatar?: Partial<DotAvatarConfig>): DotAvatarConfig {
  const color = (value?: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
  return {
    shape: ['circle', 'squircle', 'blob'].includes(avatar?.shape || '') ? avatar!.shape! : 'circle',
    eyes: ['dot', 'happy', 'sleepy'].includes(avatar?.eyes || '') ? avatar!.eyes! : 'dot',
    glasses: ['none', 'round', 'square'].includes(avatar?.glasses || '') ? avatar!.glasses! : 'none',
    accessory: ACCESSORIES.some(([id]) => id === avatar?.accessory) ? avatar!.accessory! : 'none',
    ...(color(avatar?.accessoryColor) ? { accessoryColor: color(avatar?.accessoryColor) } : {}),
    ...(color(avatar?.glassesColor) ? { glassesColor: color(avatar?.glassesColor) } : {}),
  };
}

/** Shade custom colors while keeping the details visible on pale and dark accessories. */
export function shadeAvatarColor(color: string, amount: number): string {
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(color.slice(offset, offset + 2), 16);
    return Math.round(amount < 0 ? value * (1 + amount) : value + (255 - value) * amount)
      .toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
