import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { discoverProviderModels, merge9RouterCatalog } from '../src/main/providers/openai/routerModels';
import { listModelDetails } from '../src/main/providers/openai/chat';
import { groupModels } from '../src/shared/models';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }); });
async function endpoint(data: unknown, status = 200) {
  const server = createServer((req, res) => {
    expect(req.url).toBe('/v1/models');
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`;
}
describe('router model discovery', () => {
  it('retains every routed ID, no-auth free model, disabled catalog entry, and live metadata', () => {
    const models = merge9RouterCatalog([
      { id: 'nvidia/vendor/model', label: 'Live NVIDIA', supportsTools: true, contextWindow: 200000, free: false },
      { id: 'my-combo', label: 'My combo' },
      { id: 'oc/union-alpha', label: 'Union Alpha', free: false },
    ], [
      ...Array.from({ length: 100 }, (_, i) => ({ routedModel: `other/model-${i}`, name: `Model ${i}` })),
      { routedModel: 'oc/muse-spark-1.3-contributor-free', name: 'Muse Spark Free', caps: { tools: true, contextWindow: 1048576 } },
      { routedModel: 'nvidia/vendor/model', name: 'Catalog NVIDIA' },
      { routedModel: 'oc/space-bunny-free' },
      { routedModel: 'oc/union-alpha', name: 'Union Alpha Free' },
      { routedModel: 'ocg/paid', name: 'OpenCode Go' },
      { routedModel: 'other/model-99' },
      { name: 'Invalid entry' },
    ]);
    expect(models).toHaveLength(106);
    expect(models.find(m => m.id === 'oc/muse-spark-1.3-contributor-free')).toMatchObject({ free: true, available: true, supportsTools: true, contextWindow: 1048576 });
    expect(models.find(m => m.id === 'nvidia/vendor/model')).toMatchObject({ label: 'Live NVIDIA', available: true, supportsTools: true, contextWindow: 200000 });
    expect(models.find(m => m.id === 'ocg/paid')).toMatchObject({ available: false, free: false });
    expect(models.find(m => m.id === 'oc/union-alpha')).toMatchObject({ available: true, free: true });
    expect(groupModels(models).flatMap(g => g.models)).toHaveLength(106);
    expect(groupModels(models).find(g => g.label === 'OpenCode Free')?.models).toHaveLength(3);
  });
  it('recognizes 9router capability metadata and free suffixes without marking trial models free', async () => {
    const baseUrl = await endpoint({ data: [
      { id: 'oc/model-free', capabilities: { tools: true, contextWindow: 128000 } },
      { id: 'nvidia/model', capabilities: { tools: false, contextWindow: 64000 } },
      { id: 'vendor/explicit-free', free: false },
    ] });
    const models = await listModelDetails(baseUrl, '', new AbortController().signal);
    expect(models.find(m => m.id === 'oc/model-free')).toMatchObject({ free: true, supportsTools: true, contextWindow: 128000 });
    expect(models.find(m => m.id === 'nvidia/model')).toMatchObject({ free: false, supportsTools: false, contextWindow: 64000 });
    expect(models.find(m => m.id === 'vendor/explicit-free')?.free).toBe(false);
  });
  it('never uses local router credentials for another port or another provider', async () => {
    const baseUrl = await endpoint({ data: [{ id: 'local/model' }] });
    const loader = vi.fn();
    expect(await discoverProviderModels({ label: '9router', baseUrl }, '', new AbortController().signal, loader)).toHaveLength(1);
    expect(loader).not.toHaveBeenCalled();
    const modelsFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: 'remote/model' }] })));
    try {
      await discoverProviderModels({ label: '9router', baseUrl: 'https://router.example/v1' }, 'saved-key', new AbortController().signal, loader);
      await discoverProviderModels({ label: 'Other provider', baseUrl: 'http://localhost:20128/v1' }, '', new AbortController().signal, loader);
      expect(loader).not.toHaveBeenCalled();
    } finally { modelsFetch.mockRestore(); }
  });
  it('merges the local authenticated catalog and preserves discovery errors', async () => {
    const modelsFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: 'nvidia/live' }] })));
    const configure = vi.fn();
    const getModels = vi.fn().mockResolvedValue({ success: true, data: { models: [{ routedModel: 'oc/new-free' }] } });
    try {
      const models = await discoverProviderModels({ label: '9Router', baseUrl: 'http://localhost:20128/v1' }, '', new AbortController().signal, () => ({ configure, getModels }));
      expect(models.map(m => m.id)).toEqual(['nvidia/live', 'oc/new-free']);
      expect(configure).toHaveBeenCalledWith({ host: 'localhost', port: 20128, protocol: 'http:' });
      getModels.mockResolvedValue({ success: false });
      expect(await discoverProviderModels({ label: '9router', baseUrl: 'http://localhost:20128/v1' }, '', new AbortController().signal, () => ({ configure, getModels }))).toHaveLength(1);
      modelsFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Wrong key' } }), { status: 401 }));
      await expect(discoverProviderModels({ label: '9router', baseUrl: 'http://localhost:20128/v1' }, '', new AbortController().signal)).rejects.toThrow('rejected the API key');
    } finally { modelsFetch.mockRestore(); }
  });
});
