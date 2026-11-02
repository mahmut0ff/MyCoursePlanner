// Render a handful of frames for visual QA:
//   COMP=SabakHubOwnerReels PROPS='{"guides":true}' SCALE=0.5 node stills.mjs 100 230 ...
// (run `npx remotion bundle --out-dir=build` first)
import { renderStill, selectComposition, openBrowser } from '@remotion/renderer';
import path from 'node:path';

const serveUrl = path.resolve('build');
const frames = process.argv.slice(2).map(Number);
const inputProps = process.env.PROPS ? JSON.parse(process.env.PROPS) : {};
const scale = process.env.SCALE ? Number(process.env.SCALE) : 0.5;
const outDir = process.env.OUTDIR || 'out/stills';
const browser = await openBrowser('chrome');
const composition = await selectComposition({ serveUrl, id: process.env.COMP || 'SabakHubPromo', inputProps, puppeteerInstance: browser });
for (const frame of frames) {
  await renderStill({ composition, serveUrl, frame, inputProps, output: `${outDir}/f${String(frame).padStart(4, '0')}.png`, scale, puppeteerInstance: browser });
  console.log('frame', frame);
}
await browser.close({ silent: true });
