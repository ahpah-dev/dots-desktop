import { CODEX_PROVIDER_ID, type ProviderOption } from '@shared/types';
import type { AgentProvider } from './types';
import type { CodexAuthService } from './codex/auth';
import { CodexProvider } from './codex/provider';
import { OpenAICompatibleProvider } from './openai/provider';
import type { ProviderStore } from '../storage/providerStore';

/**
 * Resolves provider ids to implementations. To add a new model backend, implement
 * {@link AgentProvider} and return it from {@link ProviderRegistry.get}.
 */
export class ProviderRegistry {
  private codex: CodexProvider;

  constructor(private auth: CodexAuthService, private store: ProviderStore) {
    this.codex = new CodexProvider(auth);
  }

  get(id: string): AgentProvider {
    if (id === CODEX_PROVIDER_ID) return this.codex;
    const profile = this.store.get(id);
    if (!profile) throw new Error('The model provider for this Dot was removed. Choose another one in the Dot\'s settings.');
    return new OpenAICompatibleProvider(profile, (pid) => this.store.getApiKey(pid));
  }

  async options(): Promise<ProviderOption[]> {
    const status = await this.auth.status();
    const codex: ProviderOption = {
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      label: 'OpenAI Codex',
      available: status.installed && status.loggedIn,
      reason: !status.installed ? 'Codex CLI not installed' : !status.loggedIn ? 'Not signed in' : undefined
    };
    const profiles = await this.store.list();
    return [
      codex,
      ...profiles.map<ProviderOption>((p) => ({
        id: p.id, kind: 'openai-compatible', label: p.label, available: p.hasKey || p.requiresKey === false, reason: p.hasKey || p.requiresKey === false ? undefined : 'No API key'
      }))
    ];
  }
}
