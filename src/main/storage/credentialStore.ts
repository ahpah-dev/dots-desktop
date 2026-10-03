import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

/** Abstraction over OS-level encryption (Electron `safeStorage`: DPAPI / Keychain / libsecret). */
export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

/**
 * Stores secrets (API keys for OpenAI-compatible providers) encrypted with the OS keystore.
 * Secrets are never written in plaintext: if OS encryption is unavailable, saving fails loudly.
 * Secrets never cross the IPC boundary to the renderer.
 */
export class CredentialStore {
  private cache: Record<string, string> | null = null;

  constructor(private file: string, private cipher: SecretCipher) {}

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      const blob = await fs.readFile(this.file);
      if (!this.cipher.isAvailable()) throw new Error('Secure storage is unavailable on this system.');
      this.cache = JSON.parse(this.cipher.decrypt(blob)) as Record<string, string>;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.cache = {};
      else if (err instanceof SyntaxError || /decrypt/i.test(String((err as Error).message))) {
        // Keystore changed (e.g. new OS user). Don't crash; the user simply re-enters keys.
        await fs.rename(this.file, `${this.file}.unreadable-${Date.now()}`).catch(() => undefined);
        this.cache = {};
      } else throw err;
    }
    return this.cache;
  }

  private async persist(map: Record<string, string>): Promise<void> {
    if (!this.cipher.isAvailable()) {
      throw new Error('Secure credential storage is not available on this system, so the key was not saved.');
    }
    const blob = this.cipher.encrypt(JSON.stringify(map));
    await fs.mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, blob, { mode: 0o600 });
    await fs.rename(tmp, this.file);
    this.cache = map;
  }

  async has(key: string): Promise<boolean> {
    return key in (await this.load());
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.load())[key];
  }

  async set(key: string, value: string): Promise<void> {
    const map = { ...(await this.load()), [key]: value };
    await this.persist(map);
  }

  async delete(key: string): Promise<void> {
    const map = { ...(await this.load()) };
    if (!(key in map)) return;
    delete map[key];
    await this.persist(map);
  }
}
