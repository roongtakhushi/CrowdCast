/**
 * Generates the PWA icon set from an inline SVG:  npx tsx scripts/make-icons.ts
 * (Already run; the PNGs are committed under public/icons.)
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const svg = (pad: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0891b2"/></linearGradient></defs>
  <rect width="512" height="512" fill="#0a0b10"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
    <circle cx="256" cy="256" r="48" fill="#fff"/>
    <path d="M152 152a147 147 0 0 0 0 208M360 152a147 147 0 0 1 0 208" stroke="#fff" stroke-width="32" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;

async function main() {
  const out = path.join(process.cwd(), "public", "icons");
  await mkdir(out, { recursive: true });
  await sharp(Buffer.from(svg(0))).resize(192).png().toFile(path.join(out, "icon-192.png"));
  await sharp(Buffer.from(svg(0))).resize(512).png().toFile(path.join(out, "icon-512.png"));
  await sharp(Buffer.from(svg(0))).resize(180).png().toFile(path.join(out, "apple-touch-icon.png"));
  await sharp(Buffer.from(svg(64))).resize(512).png().toFile(path.join(out, "icon-maskable-512.png"));
}

void main();
