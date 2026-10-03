import { clip, sleep, uid } from '../util/misc';
import { assertPublicUrl, decodeEntities, htmlToText, isObviouslyLocalHost, safeFetch } from './net';
import { ToolError, num, str, type Tool } from './types';

function requireWeb(web: boolean): void {
  if (!web) throw new ToolError('Web access is not permitted for this Dot.');
}

export const webFetch: Tool = {
  name: 'web_fetch',
  description: 'Fetch a URL and return its readable text (HTML is converted to text; JSON/plain text returned as-is). Fast; does not run JavaScript. Use browse_page for JavaScript-heavy sites.',
  category: 'web',
  parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  describe: (a) => String(a.url ?? ''),
  async run(args, ctx) {
    requireWeb(ctx.permissions.web);
    const res = await safeFetch(str(args, 'url'), { allowPrivate: ctx.permissions.outsideWorkspace, signal: ctx.signal }).catch((e) => {
      throw new ToolError(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) throw new ToolError(`HTTP ${res.status} ${res.statusText}`);
    if (/^(image|audio|video)\//.test(type) || /octet-stream|zip|pdf/.test(type)) {
      throw new ToolError(`Unsupported content type: ${type}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const raw = buf.subarray(0, 3_000_000).toString('utf8');
    if (/html/.test(type) || /^\s*<(!doctype|html)/i.test(raw)) {
      const { title, text } = htmlToText(raw);
      return clip(`${title ? `# ${title}\n\n` : ''}${text}`, 30_000);
    }
    return clip(raw, 30_000);
  }
};

interface SearchHit { title: string; url: string; snippet: string }

/** DuckDuckGo's HTML endpoint — keyless. Swap this function to plug in another search backend. */
export async function duckDuckGoSearch(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await safeFetch('https://html.duckduckgo.com/html/', {
    allowPrivate: false,
    signal,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: query }).toString()
    }
  });
  if (!res.ok) throw new Error(`Search failed with HTTP ${res.status}.`);
  const html = await res.text();
  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  for (let m = re.exec(html); m && hits.length < 10; m = re.exec(html)) {
    let url = decodeEntities(m[1]);
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith('//')) url = `https:${url}`;
    if (!/^https?:\/\//.test(url)) continue;
    hits.push({
      title: decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim(),
      url,
      snippet: decodeEntities((m[3] ?? '').replace(/<[^>]+>/g, '')).trim()
    });
  }
  if (!hits.length && /anomaly|captcha|unusual traffic/i.test(html)) {
    throw new Error('The search engine temporarily blocked automated searches. Try again later or fetch a known URL directly.');
  }
  return hits;
}

export const webSearch: Tool = {
  name: 'web_search',
  description: 'Search the web. Returns up to 10 results with titles, URLs and snippets. Follow up with web_fetch or browse_page to read a result.',
  category: 'search',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  describe: (a) => String(a.query ?? ''),
  async run(args, ctx) {
    requireWeb(ctx.permissions.web);
    const hits = await duckDuckGoSearch(str(args, 'query'), ctx.signal).catch((e) => {
      throw new ToolError(e instanceof Error ? e.message : String(e));
    });
    if (!hits.length) return 'No results.';
    return hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`).join('\n\n');
  }
};

let activeBrowsers = 0;

/** Render a page in a hidden, sandboxed Chromium window (runs JavaScript) and return its text and links. */
export const browsePage: Tool = {
  name: 'browse_page',
  description: 'Open a URL in a real, sandboxed browser (JavaScript runs) and return the visible text plus the first links. Use for dynamic sites.',
  category: 'web',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' }, wait_ms: { type: 'number', description: 'Extra time to let scripts settle. Default 1500, max 10000.' } },
    required: ['url']
  },
  describe: (a) => String(a.url ?? ''),
  async run(args, ctx) {
    requireWeb(ctx.permissions.web);
    const url = (await assertPublicUrl(str(args, 'url'), ctx.permissions.outsideWorkspace).catch((e) => {
      throw new ToolError(e instanceof Error ? e.message : String(e));
    })).toString();
    if (activeBrowsers >= 2) throw new ToolError('Too many browser pages are open right now; try web_fetch or retry shortly.');
    activeBrowsers++;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BrowserWindow, session } = require('electron') as typeof import('electron');
      const ses = session.fromPartition(`dots-browse-${uid()}`); // no "persist:" → in-memory, isolated
      const allowPrivate = ctx.permissions.outsideWorkspace;
      ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
      ses.on('will-download', (e) => e.preventDefault());
      ses.webRequest.onBeforeRequest((d, cb) => {
        try {
          const u = new URL(d.url);
          const ok = u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'data:' || u.protocol === 'blob:';
          cb({ cancel: !ok || (!allowPrivate && (u.protocol === 'http:' || u.protocol === 'https:') && isObviouslyLocalHost(u.hostname)) });
        } catch { cb({ cancel: true }); }
      });
      const win = new BrowserWindow({
        show: false, width: 1280, height: 900,
        webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false }
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const onAbort = () => { if (!win.isDestroyed()) win.destroy(); };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      try {
        await Promise.race([
          win.loadURL(url).catch(() => undefined), // ERR_ABORTED on redirects is benign; content is checked below
          sleep(30_000).then(() => { throw new Error('Page load timed out.'); })
        ]);
        await sleep(Math.min(10_000, Math.max(0, num(args, 'wait_ms', 1500))), ctx.signal);
        if (win.isDestroyed()) throw new ToolError('Cancelled.');
        const page = (await win.webContents.executeJavaScript(`(() => ({
          title: document.title,
          url: location.href,
          text: (document.body?.innerText || '').slice(0, 200000),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, 60).map(a => ({ t: (a.innerText||'').trim().slice(0,80), h: a.href })).filter(l => /^https?:/.test(l.h))
        }))()`)) as { title: string; url: string; text: string; links: { t: string; h: string }[] };
        if (!page.text.trim()) throw new ToolError('The page loaded but has no readable text.');
        const links = page.links.map((l) => `- ${l.t || '(no text)'} → ${l.h}`).join('\n');
        return clip(`# ${page.title}\n${page.url}\n\n${page.text.replace(/\n{3,}/g, '\n\n')}`, 24_000) + (links ? `\n\nLinks:\n${clip(links, 4000)}` : '');
      } finally {
        ctx.signal.removeEventListener('abort', onAbort);
        if (!win.isDestroyed()) win.destroy();
        void ses.clearStorageData().catch(() => undefined);
      }
    } finally {
      activeBrowsers--;
    }
  }
};
