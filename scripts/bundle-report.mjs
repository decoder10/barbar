// What the browser must download before the working app can render: the entry script, its modulepreload
// chunks and stylesheets from a built `dist`. Other chunks are listed separately. Nothing is served
// or uploaded; sizes are computed from the files on disk.
//
//   npm run build && npm run perf:bundle -- [--dist dist] [--page index.html] [--out file.json]
//
// gzip uses zlib level 9 and brotli quality 11, so numbers from two builds are comparable; the CDN may
// compress with other settings.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const dist = argument('dist', 'dist');
const page = argument('page', 'index.html');
const out = argument('out');
const html = readFileSync(join(dist, page), 'utf8');

const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]+)"`))?.[1];
const tags = html.match(/<(script|link)\b[^>]*>/g) || [];
const firstScreen = tags.flatMap((tag) => {
  const rel = attribute(tag, 'rel');
  const url =
    tag.startsWith('<script') && attribute(tag, 'type') === 'module'
      ? attribute(tag, 'src')
      : ['modulepreload', 'stylesheet'].includes(rel)
        ? attribute(tag, 'href')
        : undefined;
  return url?.startsWith('/assets/') ? [url.slice(1)] : [];
});

const size = (file) => {
  const content = readFileSync(join(dist, file));
  return {
    file,
    raw: content.length,
    gzip: gzipSync(content, { level: 9 }).length,
    brotli: brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
};
const total = (files) => ({
  raw: files.reduce((sum, f) => sum + f.raw, 0),
  gzip: files.reduce((sum, f) => sum + f.gzip, 0),
  brotli: files.reduce((sum, f) => sum + f.brotli, 0),
});
const initial = firstScreen.map(size);
const js = initial.filter((f) => f.file.endsWith('.js'));
const css = initial.filter((f) => f.file.endsWith('.css'));
// Not requested by this page's HTML: lazy pages, locales and other entries such as the guest menu.
const other = readdirSync(join(dist, 'assets'))
  .map((name) => `assets/${name}`)
  .filter((file) => file.endsWith('.js') && !firstScreen.includes(file))
  .map(size)
  .sort((a, b) => b.gzip - a.gzip);

// Cocktail notes exist only in the bootstrap catalog (src/barbar/data/cocktails.json); photo and menu
// modules repeat product names, so names alone would not show where the seed data is bundled.
const cocktails = JSON.parse(readFileSync('src/barbar/data/cocktails.json', 'utf8'));
const notes = cocktails.map((c) => c.notes).filter((n) => typeof n === 'string' && n.length > 25);
const markers = [...new Set(notes)];
const seedCatalog = { markers: markers.length, foundIn: {} };
for (const file of [...firstScreen, ...other.map((f) => f.file)].filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(join(dist, file), 'utf8');
  const found = markers.filter((m) => text.includes(JSON.stringify(m).slice(1, -1))).length;
  if (found) seedCatalog.foundIn[file] = found;
}

const report = {
  page,
  compression: { gzip: 'zlib level 9', brotli: 'quality 11' },
  firstScreen: { files: initial, js: total(js), css: total(css), all: total(initial) },
  seedCatalog: { ...seedCatalog, inFirstScreen: firstScreen.some((f) => seedCatalog.foundIn[f]) },
  otherJs: { files: other.length, total: total(other), largest: other.slice(0, 8) },
};
const text = JSON.stringify(report, null, 2);
if (out) writeFileSync(out, text + '\n');
console.log(text);
