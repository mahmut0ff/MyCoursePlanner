import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { getVideoEmbedUrl, isDirectVideoFile } from '../../src/utils/videoEmbed';

/**
 * The point of these tests is the HOST, not the tidiness of the string.
 * `frame-src` in netlify.toml allows `https://*.youtube.com`, and a wildcard
 * label never matches the bare `youtube.com` — so an embed URL without `www.`
 * gets blocked by the browser and the lesson shows an empty grey box.
 */
describe('getVideoEmbedUrl', () => {
  it('sends every YouTube form to a host the CSP allows', () => {
    const cases = [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abcdef',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      '  https://youtu.be/dQw4w9WgXcQ  ',
    ];
    for (const input of cases) {
      expect(getVideoEmbedUrl(input), input).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    }
  });

  it('keeps the timestamp the teacher linked to', () => {
    expect(getVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=90'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=90');
    expect(getVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=3723');
  });

  it('turns Vimeo pages into the player, private hash included', () => {
    expect(getVideoEmbedUrl('https://vimeo.com/123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
    expect(getVideoEmbedUrl('https://vimeo.com/123456789/abc123def'))
      .toBe('https://player.vimeo.com/video/123456789?h=abc123def');
    expect(getVideoEmbedUrl('https://player.vimeo.com/video/123456789'))
      .toBe('https://player.vimeo.com/video/123456789');
  });

  it('refuses what it cannot frame instead of handing over a dead URL', () => {
    const unframeable = [
      '',
      'not a url',
      'javascript:alert(1)',
      'https://rutube.ru/video/abc123/',
      'https://vk.com/video-1_2',
      'https://drive.google.com/file/d/abc/view',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/@somechannel',
      'https://vimeo.com/channels/staffpicks',
    ];
    for (const input of unframeable) {
      expect(getVideoEmbedUrl(input), input).toBeNull();
    }
  });
});

/**
 * Nothing in CI used to compare the URLs we build against the policy we ship,
 * so the two drifted apart in production and only a grey box said so. These
 * read the real header out of netlify.toml.
 */
describe('CSP frame-src vs. what the app actually frames', () => {
  const toml = readFileSync(path.resolve(__dirname, '../../netlify.toml'), 'utf8');
  const csp = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1] || '';
  const frameSrc = (csp.split(';').find((d) => d.trim().startsWith('frame-src')) || '')
    .trim().split(/\s+/).slice(1);

  /** Host matching per CSP: a `*.` label needs at least one real subdomain. */
  const allowsFraming = (target: string): boolean => {
    const { protocol, hostname } = new URL(target);
    return frameSrc.some((source) => {
      if (!source.startsWith('http')) return false; // 'self' / blob: — not cross-origin
      const src = new URL(source);
      if (src.protocol !== protocol) return false;
      if (!src.hostname.startsWith('*.')) return src.hostname === hostname;
      return hostname.endsWith(src.hostname.slice(1)) && hostname !== src.hostname.slice(2);
    });
  };

  it('has a frame-src at all', () => {
    expect(csp).not.toBe('');
    expect(frameSrc.length).toBeGreaterThan(0);
  });

  it('allows every embed getVideoEmbedUrl can produce', () => {
    const produced = [
      getVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ'),
      getVideoEmbedUrl('https://youtube.com/watch?v=dQw4w9WgXcQ'),
      getVideoEmbedUrl('https://vimeo.com/123456789'),
    ];
    for (const url of produced) {
      expect(url, 'normaliser returned null').not.toBeNull();
      expect(allowsFraming(url!), url!).toBe(true);
    }
  });

  it('allows the other frames the app renders', () => {
    const framed = [
      'https://firebasestorage.googleapis.com/v0/b/x/o/doc.pdf?alt=media', // FileViewerModal, DocumentViewerPage
      'https://view.officeapps.live.com/op/embed.aspx?src=x',              // getViewerUrl
      'https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4',      // PublicOrgProfilePage
    ];
    for (const url of framed) expect(allowsFraming(url), url).toBe(true);
  });

  it('still blocks hosts we never embed', () => {
    expect(allowsFraming('https://evil.example.com/x')).toBe(false);
    expect(allowsFraming('https://notyoutube.com/embed/x')).toBe(false);
  });
});

describe('isDirectVideoFile', () => {
  it('recognises an uploaded file, query string and all', () => {
    expect(isDirectVideoFile('https://firebasestorage.googleapis.com/v0/b/x/o/lesson.mp4?alt=media&token=1')).toBe(true);
    expect(isDirectVideoFile('https://cdn.example.com/a.WEBM')).toBe(true);
    expect(isDirectVideoFile('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isDirectVideoFile('')).toBe(false);
  });
});
