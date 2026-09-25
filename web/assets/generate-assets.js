// One-off asset generator. Run with: node assets/generate-assets.js
// Not needed at runtime — sharp is not a production dependency.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const logoSvg = fs.readFileSync(path.join(__dirname, 'logo.svg'));
const publicDir = path.join(__dirname, '..', 'public');

async function main() {
  await sharp(logoSvg).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.png'));
  await sharp(logoSvg).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(logoSvg).resize(512, 512).png().toFile(path.join(publicDir, 'logo.png'));

  // OG preview image: logo centered on a card-colored canvas, standard 1200x630 ratio.
  const ogBg = Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0a0d13"/>
          <stop offset="100%" stop-color="#151a2b"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#g)"/>
      <circle cx="200" cy="120" r="260" fill="#6d8cff" opacity="0.12"/>
      <circle cx="1050" cy="560" r="220" fill="#8a6dff" opacity="0.10"/>
    </svg>`
  );
  const logoPng = await sharp(logoSvg).resize(220, 220).png().toBuffer();

  await sharp(ogBg)
    .composite([{ input: logoPng, left: (1200 - 220) / 2, top: 90 }])
    .png()
    .toFile(path.join(publicDir, 'og-image-base.png'));

  // Add text via SVG overlay (sharp can't do text layout well, so draw it as SVG text).
  const textSvg = Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <text x="600" y="400" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#eef1f7" text-anchor="middle">NFC Card</text>
      <text x="600" y="450" font-family="Arial, sans-serif" font-size="26" fill="#8992a3" text-anchor="middle">Digital business card</text>
    </svg>`
  );

  await sharp(path.join(publicDir, 'og-image-base.png'))
    .composite([{ input: textSvg, left: 0, top: 0 }])
    .png()
    .toFile(path.join(publicDir, 'og-image.png'));

  fs.unlinkSync(path.join(publicDir, 'og-image-base.png'));
  console.log('Assets generated in public/: favicon.png, apple-touch-icon.png, logo.png, og-image.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
