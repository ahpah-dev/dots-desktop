import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True for loopback, private, link-local, CGNAT and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}

/** Cheap synchronous check usable for sub-resource filtering (no DNS). */
export function isObviouslyLocalHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  return isIP(h) !== 0 && isPrivateAddress(h);
}

/**
 * Validate that a URL is http(s) and resolves only to public addresses, so a web-enabled agent
 * can't be steered into probing the user's local network. Dots with outside-workspace access skip this.
 */
export async function assertPublicUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed.');
  if (allowPrivate) return url;
  if (isObviouslyLocalHost(url.hostname)) throw new Error('Access to local/private network addresses is blocked for this Dot.');
  if (!isIP(url.hostname)) {
    const addrs = await lookup(url.hostname, { all: true }).catch(() => {
      throw new Error(`Could not resolve ${url.hostname}.`);
    });
    if (addrs.some((a) => isPrivateAddress(a.address))) {
      throw new Error('Access to local/private network addresses is blocked for this Dot.');
    }
  }
  return url;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/table|hr)[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

/** Fetch with manual redirect following so every hop is re-validated. */
export async function safeFetch(
  rawUrl: string,
  opts: { allowPrivate: boolean; signal: AbortSignal; timeoutMs?: number; init?: RequestInit }
): Promise<Response> {
  let url = (await assertPublicUrl(rawUrl, opts.allowPrivate)).toString();
  for (let hop = 0; hop < 6; hop++) {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
    const res = await fetch(url, {
      ...opts.init,
      redirect: 'manual',
      signal: AbortSignal.any([opts.signal, timeout]),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; DotsAgent/1.0)',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        ...(opts.init?.headers as Record<string, string> | undefined)
      }
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = (await assertPublicUrl(new URL(res.headers.get('location')!, url).toString(), opts.allowPrivate)).toString();
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects.');
}
