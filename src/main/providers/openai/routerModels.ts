import { createRequire } from 'node:module';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ModelInfo, ProviderProfileInput } from '@shared/types';
import { listModelDetails } from './chat';

interface RouterCatalogModel {
  routedModel?: string;
  fullModel?: string;
  name?: string;
  caps?: { tools?: boolean; contextWindow?: number };
}
interface CatalogClient {
  configure(options: { host: string; port: number; protocol: string }): void;
  getModels(): Promise<{ success: boolean; data?: { models?: RouterCatalogModel[] } }>;
}
type CatalogLoader = () => CatalogClient | undefined;

function localCatalogClient(): CatalogClient | undefined {
  // Use the installed router's authenticated, read-only catalog client. Its
  // credentials stay in the main process and are never sent to another host.
  const require = createRequire(__filename);
  const roots = process.platform === 'win32'
    ? [join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules')]
    : [join(homedir(), '.npm-global', 'lib', 'node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules'];
  for (const root of roots) {
    try {
      const client = require(join(root, '9router', 'src', 'cli', 'api', 'client.js')) as CatalogClient;
      if (typeof client.configure === 'function' && typeof client.getModels === 'function') return client;
    } catch { /* A router without its CLI still supports standard /models discovery. */ }
  }
  return undefined;
}

export function merge9RouterCatalog(available: ModelInfo[], catalog: RouterCatalogModel[]): ModelInfo[] {
  const models = new Map(available.map(model => [model.id, { ...model, available: true }]));
  for (const entry of catalog) {
    const id = entry.routedModel || entry.fullModel;
    if (typeof id !== 'string' || !id.trim()) continue;
    const listed = models.get(id);
    // OpenCode Free uses no account/connection; 9router can route it even when
    // /v1/models only lists the user's connected, authenticated providers.
    const free = id.startsWith('oc/') || /(?:[:/-]free)$/.test(id);
    models.set(id, {
      id, label: entry.name || id,
      contextWindow: entry.caps?.contextWindow,
      supportsTools: entry.caps?.tools,
      available: id.startsWith('oc/'),
      ...listed,
      free: id.startsWith('oc/') ? true : listed?.free ?? free,
    });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function discoverProviderModels(
  profile: Pick<ProviderProfileInput, 'baseUrl' | 'label' | 'presetId'>,
  apiKey: string,
  signal: AbortSignal,
  loadCatalog: CatalogLoader = localCatalogClient,
): Promise<ModelInfo[]> {
  const available = await listModelDetails(profile.baseUrl, apiKey, signal);
  const url = new URL(profile.baseUrl);
  if ((profile.presetId !== '9router' && !/^9\s*router$/i.test(profile.label.trim())) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.protocol !== 'http:' || url.port !== '20128' || url.pathname !== '/v1') return available;
  try {
    const client = loadCatalog();
    if (!client || signal.aborted) return available;
    client.configure({ host: url.hostname === '[::1]' ? '::1' : url.hostname, port: Number(url.port || 80), protocol: url.protocol });
    const result = await client.getModels();
    if (signal.aborted) signal.throwIfAborted();
    if (result.success && Array.isArray(result.data?.models)) return merge9RouterCatalog(available, result.data.models);
  } catch { if (signal.aborted) signal.throwIfAborted(); }
  return available;
}
