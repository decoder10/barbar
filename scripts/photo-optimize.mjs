import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { imageInputs as sources, inputUrl, photoRoot as root } from './photo-sources.mjs';

// Offline only: deploys serve committed files and never encode on a request.
sharp.concurrency(1);
const output = new URL('optimized/', root);
mkdirSync(output, { recursive: true });
const indexUrl = new URL('variants.json', output);
const previous = existsSync(indexUrl) ? JSON.parse(readFileSync(indexUrl)) : {};
const index = {};
const settings = JSON.stringify({
  widths: [160, 320, 640],
  avif: 55,
  webp: 80,
  version: 1,
  sharp: sharp.versions,
});
let originalBytes = 0;
let selectedBytes = 0;
let avifCount = 0;
let encoded = 0;
for (const [key, source] of Object.entries(sources)) {
  const input = readFileSync(inputUrl(source.file));
  const inputHash = createHash('sha256').update(input).digest('hex');
  const signature = createHash('sha256').update(input).update(settings).digest('hex');
  const cached = previous[key];
  if (cached?.signature === signature && cached.variants.every((v) => existsSync(new URL(v.file, output)))) {
    index[key] = cached;
  } else {
    const metadata = await sharp(input).metadata();
    const widths = [
      ...new Set([160, 320, Math.min(640, metadata.width)].filter((w) => w <= metadata.width)),
    ].sort((a, b) => a - b);
    const variants = [];
    for (const width of widths) {
      for (const format of ['webp', 'avif']) {
        const pipeline = sharp(input).rotate().resize({ width, withoutEnlargement: true });
        const bytes = await (
          format === 'avif'
            ? pipeline.avif({ quality: 55, effort: 4, chromaSubsampling: '4:4:4' })
            : pipeline.webp({ quality: 80, effort: 4 })
        ).toBuffer();
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
        const file = `${key}-${width}-${hash}.${format}`;
        if (!existsSync(new URL(file, output))) writeFileSync(new URL(file, output), bytes);
        variants.push({ file, width, format, bytes: bytes.length });
      }
    }
    index[key] = { signature, inputHash, width: metadata.width, height: metadata.height, variants };
    encoded++;
  }
  const entry = index[key];
  const largest = (format) => entry.variants.filter((v) => v.format === format).at(-1).bytes;
  entry.preferAvif = largest('avif') < largest('webp');
  originalBytes += input.length;
  selectedBytes += Math.min(largest('avif'), largest('webp'));
  if (entry.preferAvif) avifCount++;
  if (Object.keys(index).length % 20 === 0)
    console.log(`Processed ${Object.keys(index).length}/${Object.keys(sources).length}`);
}
writeFileSync(indexUrl, JSON.stringify(index) + '\n');
console.log(
  JSON.stringify({
    images: Object.keys(index).length,
    encoded,
    avifCount,
    originalBytes,
    selectedBytes,
    reductionPercent: Math.round((1 - selectedBytes / originalBytes) * 100),
  }),
);
