// Chrome for scripts/prerender.mjs lives inside node_modules: Netlify caches
// node_modules between builds but not ~/.cache, so a cached install would
// otherwise skip puppeteer's postinstall and find no browser.
const { join } = require('path');

module.exports = { cacheDirectory: join(__dirname, 'node_modules', '.cache', 'puppeteer') };
