// @ts-expect-error — plain .mjs build script, no types
import { injectHead, injectRoot, deferBoot } from '../prerender.mjs';

const shell = `<!doctype html><html><head>
    <meta name="description" content="old" />
    <title>Old</title>
    <link rel="modulepreload" crossorigin href="/assets/a.js">
    <script type="module" crossorigin src="/assets/index-X.js"></script>
  </head><body><div id="root"></div></body></html>`;

describe('prerender HTML transforms', () => {
  it('swaps head tags, escapes values, adds canonical and the tags the shell lacks', () => {
    const out = injectHead(shell, {
      title: 'A & <B>', description: 'say "hi"', robots: 'index, follow',
      ogTitle: null, ogDescription: null, ogUrl: 'https://sabakhub.kg/x', canonical: 'https://sabakhub.kg/x',
    });
    expect(out).toContain('<title>A &amp; &lt;B></title>');
    expect(out).toContain('<meta name="description" content="say &quot;hi&quot;" />');
    expect(out).not.toContain('content="old"');
    expect(out).toContain('<meta name="robots" content="index, follow" />');
    expect(out).toContain('<link rel="canonical" href="https://sabakhub.kg/x" />');
    expect(out.indexOf('canonical')).toBeLessThan(out.indexOf('</head>'));
  });

  it('fills #root without treating $ in markup as a replacement pattern', () => {
    expect(injectRoot(shell, '<p>$& 5 $</p>')).toContain('<div id="root"><p>$& 5 $</p></div>');
    expect(() => injectRoot('<div id="root">x</div>', 'y')).toThrow();
  });

  it('defers the entry to boot.js and drops modulepreloads', () => {
    const out = deferBoot(shell);
    expect(out).toContain('<script src="/boot.js" data-entry="/assets/index-X.js" defer></script>');
    expect(out).not.toContain('type="module"');
    expect(out).not.toContain('modulepreload');
  });
});
