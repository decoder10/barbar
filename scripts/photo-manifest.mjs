import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sources, imageInputs, inputUrl, photoRoot as root } from './photo-sources.mjs';
const variants = JSON.parse(readFileSync(new URL('optimized/variants.json', root), 'utf8'));
const escape = (value) =>
  String(value || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// Compact client manifest, expanded by `photo-catalog.ts`: `a` lists authors once, `p` maps each key to
// [file or version, author index, width, height, webp variants, avif variants]. A variant `160.<hash>` is
// the file `/barbar/photos/optimized/<key>-160-<hash>.<format>`; a bare version means
// `/barbar/photos/<key>.webp?v=<version>`.
const authors = [];
const files = {};
const compact = Object.fromEntries(
  Object.entries(imageInputs).map(([key, value]) => {
    const bytes = readFileSync(inputUrl(value.file));
    const optimized = variants[key];
    if (!optimized || optimized.inputHash !== createHash('sha256').update(bytes).digest('hex')) {
      throw new Error(`Run npm run photos:optimize for changed image: ${key}`);
    }
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    files[key] = `${value.file}?v=${version}`;
    const list = (format) =>
      optimized.variants
        .filter((v) => v.format === format)
        .map((v) => {
          const hash = v.file.slice(`${key}-${v.width}-`.length, -`.${format}`.length);
          if (v.file !== `${key}-${v.width}-${hash}.${format}`) throw new Error(`Unexpected file: ${v.file}`);
          return `${v.width}.${hash}`;
        })
        .join(' ');
    if (!authors.includes(value.author)) authors.push(value.author);
    return [
      key,
      [
        value.file === `/barbar/photos/${key}.webp` ? version : files[key],
        authors.indexOf(value.author),
        optimized.width,
        optimized.height,
        list('webp'),
        optimized.preferAvif ? list('avif') : '',
      ],
    ];
  }),
);
writeFileSync(
  new URL('../src/barbar/features/catalog/media/photo-manifest.json', import.meta.url),
  JSON.stringify({ a: authors, p: compact }) + '\n',
);
writeFileSync(
  new URL('credits.html', root),
  `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Barbar · Источники фотографий</title><style>body{font:16px/1.7 system-ui;margin:40px auto;padding:0 24px;max-width:1000px;color:#243347}article{border-bottom:1px solid #ddd;padding:24px 0}a{color:#a84473}img{width:100px;height:130px;object-fit:contain;float:left;margin:0 24px 16px 0}article:after{content:'';display:block;clear:both}h2{font-size:18px}</style><a href="/">← Barbar Cafe</a><h1>Источники фотографий</h1><p>Фото используются как примеры упаковки и подачи. Изображения, созданные или обработанные ИИ, отмечены отдельно. Они не подтверждают фактический состав рецепта или объём порции.</p>${Object.entries(
    sources,
  )
    .map(
      ([key, p]) =>
        `<article><img src="${escape(files[key])}" alt="" loading="lazy"><h2>${escape(p.title || key)}</h2><p>${escape(p.author)} · ${escape(p.license)}</p><a href="${escape(p.source)}" rel="noreferrer">Источник</a>${p.licenseUrl ? ` · <a href="${escape(p.licenseUrl)}" rel="noreferrer">Лицензия</a>` : ''}<p>${escape(p.modifications)}</p></article>`,
    )
    .join('')}</html>`,
);
console.log(`Built ${Object.keys(compact).length} versioned photo entries and credits.`);
