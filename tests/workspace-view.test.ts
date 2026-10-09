import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkspaceText, WorkspacePreviews } from '../src/main/workspaceView';
import { codingPrompt, localPreviewUrl } from '../src/shared/coding';

describe('workspace inspection and sandboxed static hosting', () => {
  let folder: string, root: string;
  let previews: WorkspacePreviews;
  beforeEach(async () => {
    previews = new WorkspacePreviews();
    folder = await fs.mkdtemp(join(tmpdir(), 'dots-preview-test-'));
    root = join(folder, 'workspace');
    await fs.mkdir(root);
    await fs.writeFile(join(root, 'index.html'), '<button>Hello</button><script src="app.js"></script>');
    await fs.writeFile(join(root, 'app.js'), 'document.querySelector("button").textContent = "Works";');
    await fs.writeFile(join(folder, 'outside.txt'), 'outside workspace');
  });
  afterEach(async () => { previews.close(); await fs.rm(folder, { recursive: true, force: true }); });

  it('reads real UTF-8 files and rejects traversal, directories, binaries, and oversized files', async () => {
    expect((await readWorkspaceText(root, 'app.js')).content).toContain('Works');
    await expect(readWorkspaceText(root, '../outside.txt')).rejects.toThrow('outside');
    await expect(readWorkspaceText(root, '.')).rejects.toThrow('folder');
    await fs.writeFile(join(root, 'binary.txt'), Buffer.from([0, 1, 2]));
    await expect(readWorkspaceText(root, 'binary.txt')).rejects.toThrow('binary');
    await fs.writeFile(join(root, 'large.txt'), 'x'.repeat(512 * 1024 + 1));
    await expect(readWorkspaceText(root, 'large.txt')).rejects.toThrow('large');
  });

  it('rejects links that escape the workspace', async () => {
    await fs.symlink(folder, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(readWorkspaceText(root, 'escape/outside.txt')).rejects.toThrow('outside');
  });

  it('serves HTML and relative JS with a restrictive policy, opaque-origin module access, and no writes', async () => {
    const { url } = await previews.start('dot', root, 'index.html');
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("object-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("form-action 'none'");
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('app.js');
    const script = await fetch(new URL('app.js', url));
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('text/javascript');
    expect(await script.text()).toContain('Works');
    expect((await fetch(url, { method: 'POST', body: 'overwrite' })).status).toBe(405);
    expect((await readWorkspaceText(root, 'index.html')).content).toContain('Hello');
  });

  it('protects hidden files, unknown routes and symlink escapes; reuses then closes its server', async () => {
    await fs.writeFile(join(root, '.env'), 'secret');
    await fs.symlink(folder, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const { url } = await previews.start('dot', root, 'index.html');
    expect((await previews.start('dot', root, 'index.html')).url).toBe(url);
    expect((await Promise.all([previews.start('dot', root, 'index.html'), previews.start('dot', root, 'index.html')])).every(preview => preview.url === url)).toBe(true);
    for (const path of ['.env', 'escape/outside.txt', '%2e%2e%2foutside.txt']) expect((await fetch(new URL(path, url))).status).toBe(404);
    expect((await fetch(new URL('/index.html', url))).status).toBe(404);
    previews.stop('dot');
    await expect(fetch(url)).rejects.toThrow();
  });

  it('refreshes content from disk and switches the root without keeping the old server alive', async () => {
    const first = await previews.start('dot', root, 'index.html');
    await fs.writeFile(join(root, 'index.html'), 'updated');
    expect(await (await fetch(first.url)).text()).toBe('updated');
    const other = join(folder, 'other');
    await fs.mkdir(other); await fs.writeFile(join(other, 'index.html'), 'other project');
    const second = await previews.start('dot', other, 'index.html');
    expect(await (await fetch(second.url)).text()).toBe('other project');
    await expect(fetch(first.url)).rejects.toThrow();
  });
});

describe('coding context and dev server addresses', () => {
  it('references file paths without copying stale file contents or inflating every request', () => {
    const prompt = codingPrompt('Fix the button.', ['src/app.ts', 'quote"\nfile.ts'], 'fix');
    expect(prompt).toContain('read current contents before editing');
    expect(prompt).toContain('"quote\\"\\nfile.ts"');
    expect(prompt).toContain('implement and verify');
    expect(prompt.length).toBeLessThan(350);
    expect(codingPrompt('  Hi  ', [])).toBe('Hi');
  });
  it('only connects an explicit HTTP(S) loopback dev server', () => {
    expect(localPreviewUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(localPreviewUrl('http://127.0.0.1:3000/app')).toContain('/app');
    expect(localPreviewUrl('http://[::1]:8080')).toContain('[::1]');
    for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'https://example.com', 'http://localhost.example.com', 'http://user:pass@localhost:1234']) expect(() => localPreviewUrl(url)).toThrow();
  });
});
