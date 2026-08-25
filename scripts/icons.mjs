// Generates the PWA icon set into public/icons/ from inline SVG sources.
//   node scripts/icons.mjs
//
// Three variants of the same mark (dark tile, white L, amber signal dot):
//   icon-192.png / icon-512.png  — rounded tile on transparent (manifest "any")
//   icon-maskable-512.png        — full-bleed with safe-zone padding ("maskable")
//   apple-touch-icon.png (180)   — full-bleed square; iOS rounds it itself
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const out = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "public",
  "icons",
);

// The mark, drawn in a 512 viewBox. `scale` shrinks it toward the center
// (maskable safe zone); `radius` rounds the background tile.
function tile({ radius, scale }) {
  const g = (s) =>
    `<g transform="translate(${256 - 256 * s}, ${256 - 256 * s}) scale(${s})">` + s2 + "</g>";
  const s2 =
    '<circle cx="366" cy="146" r="26" fill="#C9891A"/>' +
    '<path d="M166 128v220h180" fill="none" stroke="#F7F5F0" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="${radius}" fill="#1C1D20"/>` +
    g(scale) +
    `</svg>`
  );
}

const rounded = tile({ radius: 112, scale: 1 });
const fullBleed = tile({ radius: 0, scale: 1 });
const maskable = tile({ radius: 0, scale: 0.78 }); // mark inside the ~80% safe zone

const jobs = [
  { svg: rounded, size: 192, file: "icon-192.png" },
  { svg: rounded, size: 512, file: "icon-512.png" },
  { svg: maskable, size: 512, file: "icon-maskable-512.png" },
  { svg: fullBleed, size: 180, file: "apple-touch-icon.png" },
];

for (const job of jobs) {
  await sharp(Buffer.from(job.svg), { density: 300 })
    .resize(job.size, job.size)
    .png()
    .toFile(path.join(out, job.file));
  console.log("wrote", job.file, job.size + "x" + job.size);
}
