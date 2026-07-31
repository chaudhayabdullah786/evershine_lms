const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(__dirname, '../public/assets/images');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create a 1200x630 background with Evershine Academy Primary Blue #0F4C81
const backgroundSvg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0F4C81" />
  <!-- Optional subtle design grid / gradients if desired -->
  <defs>
    <radialGradient id="grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#0F4C81" stop-opacity="1" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#grad)" />
</svg>
`;

const logoPath = path.join(__dirname, '../public/brand/logo-crest.png');
const outputPath = path.join(outputDir, 'evershine-social-share.jpg');

async function main() {
  try {
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo file not found at ${logoPath}`);
    }

    console.log(`Generating social share image using logo: ${logoPath}...`);

    // We'll resize the logo to be 400px wide (maintaining aspect ratio)
    const logoBuffer = await sharp(logoPath)
      .resize({ width: 400 })
      .toBuffer();

    // Composite the logo at the center of the background svg
    await sharp(Buffer.from(backgroundSvg))
      .composite([
        {
          input: logoBuffer,
          gravity: 'center'
        }
      ])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    console.log(`Successfully generated social share image at: ${outputPath}`);
  } catch (error) {
    console.error('Error generating social share image:', error);
    process.exit(1);
  }
}

main();
