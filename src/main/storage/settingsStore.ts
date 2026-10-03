import type { AppSettings } from '@shared/types';
import { readJson, writeJson } from '../util/jsonStore';
import { Emitter } from '../util/misc';

export function defaultSettings(defaultWorkspaceRoot: string): AppSettings {
  return {
    runInBackground: true,
    launchAtLogin: false,
    startMinimized: false,
    maxConcurrentRuns: 3,
    desktopNotifications: true,
    useCodexUserConfig: false,
    codexPathOverride: '',
    defaultWorkspaceRoot,
    theme: 'system',
    onboardingComplete: false
  };
}

export class SettingsStore {
  private value!: AppSettings;
  readonly changed = new Emitter<AppSettings>();

  constructor(private file: string, private defaults: AppSettings) {}

  async init(): Promise<void> {
    const stored = await readJson<Partial<AppSettings>>(this.file, {});
    this.value = this.sanitize({ ...this.defaults, ...stored });
  }

  get(): AppSettings {
    return this.value;
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.value = this.sanitize({ ...this.value, ...patch });
    await writeJson(this.file, this.value);
    this.changed.emit(this.value);
    return this.value;
  }

  private sanitize(s: AppSettings): AppSettings {
    return {
      ...s,
      maxConcurrentRuns: Math.min(10, Math.max(1, Math.round(Number(s.maxConcurrentRuns) || 3))),
      theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system',
      codexPathOverride: String(s.codexPathOverride ?? '').trim()
    };
  }
}
