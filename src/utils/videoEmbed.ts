/**
 * Video links are typed by a human, but framed by a browser under our CSP.
 * This module lives between those two facts.
 *
 * `frame-src` in netlify.toml lists concrete hosts, and `https://*.youtube.com`
 * does NOT cover the bare domain — it needs at least one subdomain label. So
 * rewriting `youtu.be/ID` to `youtube.com/embed/ID` (what the old inline helper
 * did) produced a URL the browser refuses to paint: the lesson shows Chrome's
 * "Это содержимое заблокировано" placeholder even though the link is perfectly
 * valid. Everything here normalises to `www.youtube.com` / `player.vimeo.com`.
 */

const YOUTUBE_ID = /^[\w-]{11}$/;
const DIRECT_VIDEO_FILE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

/** Seconds out of a `t` / `start` param: accepts `90`, `1h2m3s`, `2m30s`. */
const parseStartSeconds = (value: string | null): number => {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!parts) return 0;
  return Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
};

/**
 * Normalises a pasted link into a player URL that `frame-src` allows.
 * Returns null for anything we cannot frame — callers show a plain link
 * instead of an iframe the browser would block anyway.
 */
export const getVideoEmbedUrl = (raw: string): string | null => {
  let url: URL;
  try {
    url = new URL((raw || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.replace(/^www\./, '');
  const segments = url.pathname.split('/').filter(Boolean);

  // youtu.be/ID · /watch?v=ID · /embed/ID · /shorts/ID · /live/ID (any subdomain)
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const id = host === 'youtu.be'
      ? segments[0]
      : url.searchParams.get('v') || (['embed', 'shorts', 'live', 'v'].includes(segments[0]) ? segments[1] : '');
    if (!id || !YOUTUBE_ID.test(id)) return null;
    const start = parseStartSeconds(url.searchParams.get('start') || url.searchParams.get('t'));
    // Always `www.` — CSP's `*.youtube.com` does not match the bare domain.
    return `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ''}`;
  }

  // vimeo.com/123456789[/private-hash] · player.vimeo.com/video/123456789
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const [id, pathHash] = segments[0] === 'video' ? segments.slice(1) : segments;
    if (!/^\d+$/.test(id || '')) return null;
    const hash = pathHash || url.searchParams.get('h');
    return `https://player.vimeo.com/video/${id}${hash ? `?h=${encodeURIComponent(hash)}` : ''}`;
  }

  return null;
};

/** An uploaded file rather than a hosting page — that plays in <video>, not a frame. */
export const isDirectVideoFile = (url: string): boolean => DIRECT_VIDEO_FILE.test(url || '');
