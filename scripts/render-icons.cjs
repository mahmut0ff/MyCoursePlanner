// Rasterize public/icons/logo.svg into all PWA/favicon PNG sizes.
// Run after editing logo.svg:  node scripts/render-icons.cjs
const sharp = require('sharp');
const fs = require('fs');

const SVG = './public/icons/logo.svg';
const OUT = './public/icons';
const sizes = [48, 72, 96, 128, 192, 256, 512];

async function main() {
  const svg = fs.readFileSync(SVG);
  for (const size of sizes) {
    await sharp(svg, { density: 600 })
      .resize(size, size)
      .png()
      .toFile(`${OUT}/icon-${size}.png`);
    console.log(`icon-${size}.png`);
  }
  // logo.png mirrors the 512 icon (used by index.html favicon + auth screens)
  await sharp(svg, { density: 600 }).resize(512, 512).png().toFile(`${OUT}/logo.png`);
  console.log('logo.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
