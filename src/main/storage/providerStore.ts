import type { ProviderProfile, ProviderProfileInput } from '@shared/types';
import { readJson, writeJson } from '../util/jsonStore';
import { uid } from '../util/misc';
import type { CredentialStore } from './credentialStore';

type StoredProfile = Omit<ProviderProfile, 'hasKey'>;

const secretKey = (id: string) => `provider:${id}`;

/** OpenAI-compatible provider profiles. Metadata on disk, API keys in the {@link CredentialStore}. */
export class ProviderStore {
  private profiles: StoredProfile[] = [];

  constructor(private file: string, private creds: CredentialStore) {}

  async init(): Promise<void> {
    this.profiles = await readJson<StoredProfile[]>(this.file, []);
  }

  async list(): Promise<ProviderProfile[]> {
    return Promise.all(this.profiles.map(async (p) => ({ ...p, hasKey: await this.creds.has(secretKey(p.id)) })));
  }

  get(id: string): StoredProfile | undefined {
    return this.profiles.find((p) => p.id === id);
  }

  async getApiKey(id: string): Promise<string | undefined> {
    return this.creds.get(secretKey(id));
  }

  async save(input: ProviderProfileInput): Promise<ProviderProfile> {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const label = input.label.trim();
    if (!label) throw new Error('Give this provider a name.');
    if (!input.defaultModel.trim()) throw new Error('Choose a default model name.');

    const id = input.id ?? uid();
    const existing = this.profiles.find((p) => p.id === id);
    if (!existing && !input.apiKey?.trim()) throw new Error('An API key is required.');

    // Persist the secret first: if secure storage fails, no half-saved profile remains.
    if (input.apiKey?.trim()) await this.creds.set(secretKey(id), input.apiKey.trim());

    const profile: StoredProfile = { id, kind: 'openai-compatible', label, baseUrl, defaultModel: input.defaultModel.trim() };
    this.profiles = existing ? this.profiles.map((p) => (p.id === id ? profile : p)) : [...this.profiles, profile];
    await writeJson(this.file, this.profiles);
    return { ...profile, hasKey: true };
  }

  async delete(id: string): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    await writeJson(this.file, this.profiles);
    await this.creds.delete(secretKey(id));
  }
}

export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a valid URL, e.g. https://api.openai.com/v1');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('The URL must start with http:// or https://');
  return url.toString().replace(/\/+$/, '');
}
