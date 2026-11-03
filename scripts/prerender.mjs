// Prerender the public pages after `vite build`: crawlers and link previews get
// real HTML instead of an empty <div id="root">. Runs the built app in headless
// Chrome, snapshots #root and the <head> tags SeoHead sets, writes dist/<route>.html.
//
// dist/app.html stays the empty SPA shell — netlify.toml rewrites every other
// route to it, so /dashboard never flashes the landing page.
//
// Fail-soft: if Chrome can't start or a route breaks, that page ships as the
// plain SPA (app.html still serves it); the ::warning:: line is the signal.

import { createServer } from 'node:http';
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = join(process.cwd(), 'dist');
export const ROUTES = [
  '/', '/features', '/about', '/contact', '/docs', '/vibecoder', '/privacy', '/terms',
  // src/components/landing/solutions.ts
  '/crm-dlya-uchebnogo-centra', '/crm-dlya-yazykovoy-shkoly', '/crm-dlya-chastnoy-shkoly',
  '/crm-dlya-detskogo-centra', '/crm-dlya-onlayn-shkoly', '/kak-vybrat-crm',
];
// Not /directory: its list comes from an API that doesn't run at build time.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// Netlify serves /features from features.html with no trailing-slash redirect.
const outFile = (route) => join(DIST, route === '/' ? 'index.html' : `${route.slice(1)}.html`);
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Swap the shell's head tags for the route's values; add the ones the shell lacks.
export function injectHead(html, head) {
  let out = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escText(head.title)}</title>`);
  const extra = [];
  const setMeta = (attr, key, value) => {
    if (value == null) return;
    const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`);
    const tag = `<meta ${attr}="${key}" content="${escAttr(value)}" />`;
    if (re.test(out)) out = out.replace(re, () => tag); else extra.push(tag);
  };
  setMeta('name', 'description', head.description);
  setMeta('name', 'robots', head.robots);
  setMeta('property', 'og:title', head.ogTitle);
  setMeta('property', 'og:description', head.ogDescription);
  setMeta('property', 'og:url', head.ogUrl);
  if (head.canonical) extra.push(`<link rel="canonical" href="${escAttr(head.canonical)}" />`);
  return out.replace('</head>', () => `${extra.map((t) => `    ${t}\n`).join('')}  </head>`);
}

export function injectRoot(html, rootHtml) {
  if (!html.includes('<div id="root"></div>')) throw new Error('shell has no empty #root');
  return html.replace('<div id="root"></div>', () => `<div id="root">${rootHtml}</div>`);
}

// The page is already readable: public/boot.js starts the app on first input
// instead of letting it compete with CSS/fonts for the first paint.
export function deferBoot(html) {
  const m = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
  if (!m) throw new Error('no entry module script');
  return html
    .replace(m[0], () => `<script src="/boot.js" data-entry="${m[1]}" defer></script>`)
    .replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
}

function serve(shell) {
  return createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
    const file = join(DIST, path);
    try {
      if (file.startsWith(DIST) && (await stat(file)).isFile()) {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
        res.end(await readFile(file));
        return;
      }
    } catch { /* not a file — the SPA shell answers, as on Netlify */ }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(shell);
  });
}

async function prerender(browser, origin, shell, route) {
  const page = await browser.newPage();
  try {
    // Tall viewport: every Reveal is "already on screen" and stays visible.
    await page.setViewport({ width: 1280, height: 12000 });
    // Reduced motion lands counters, chat and intros on their final state.
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: 'light' },
    ]);
    await page.evaluateOnNewDocument(() => { localStorage.setItem('lang', 'ru'); localStorage.setItem('theme', 'light'); });
    // Third-party calls (Firebase, Sentry) add nothing to the markup.
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith(origin) ? r.continue() : r.abort()));

    await page.goto(origin + route, { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.waitForSelector('#root h1', { timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 300));

    const snap = await page.evaluate(() => {
      const meta = (sel) => document.head.querySelector(sel)?.getAttribute('content') ?? null;
      return {
        root: document.getElementById('root').innerHTML,
        head: {
          title: document.title,
          description: meta('meta[name="description"]'),
          robots: meta('meta[name="robots"]'),
          ogTitle: meta('meta[property="og:title"]'),
          ogDescription: meta('meta[property="og:description"]'),
          ogUrl: meta('meta[property="og:url"]'),
          canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        },
      };
    });
    const html = deferBoot(injectRoot(injectHead(shell, snap.head), snap.root));
    await writeFile(outFile(route), html);
    console.log(`prerendered ${route.padEnd(12)} ${(html.length / 1024).toFixed(0).padStart(4)} KB  ${snap.head.title}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const shell = await readFile(join(DIST, 'index.html'), 'utf8');
  await copyFile(join(DIST, 'index.html'), join(DIST, 'app.html'));

  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; } catch (e) {
    console.warn(`::warning::prerender skipped — puppeteer unavailable (${e.message})`);
    return;
  }
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ru'] });
  } catch (e) {
    console.warn(`::warning::prerender skipped — Chrome failed to start (${e.message})`);
    return;
  }

  const server = serve(shell).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ROUTES) {
      try { await prerender(browser, origin, shell, route); } catch (e) {
        console.warn(`::warning::prerender ${route} failed — served as SPA (${e.message})`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
