import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../public/barbar/photos/', import.meta.url);
const sources = JSON.parse(readFileSync(new URL('sources.json', root), 'utf8'));
const escape = (value) =>
  String(value || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const manifest = Object.fromEntries(
  Object.entries(sources).map(([key, value]) => {
    const bytes = readFileSync(new URL(value.file.split('/').pop(), root));
    return [
      key,
      {
        file: value.file + '?v=' + createHash('sha256').update(bytes).digest('hex').slice(0, 12),
        author: value.author,
      },
    ];
  }),
);
writeFileSync(new URL('../src/barbar/photo-manifest.json', import.meta.url), JSON.stringify(manifest) + '\n');
writeFileSync(
  new URL('credits.html', root),
  `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Barbar · Источники фотографий</title><style>body{font:16px/1.7 system-ui;margin:40px auto;padding:0 24px;max-width:1000px;color:#243347}article{border-bottom:1px solid #ddd;padding:24px 0}a{color:#a84473}img{width:100px;height:130px;object-fit:contain;float:left;margin:0 24px 16px 0}article:after{content:'';display:block;clear:both}h2{font-size:18px}</style><a href="/">← Barbar Cafe</a><h1>Источники фотографий</h1><p>Фото используются как примеры упаковки и подачи. Изображения, созданные или обработанные ИИ, отмечены отдельно. Они не подтверждают фактический состав рецепта или объём порции.</p>${Object.entries(
    sources,
  )
    .map(
      ([key, p]) =>
        `<article><img src="${escape(manifest[key].file)}" alt="" loading="lazy"><h2>${escape(p.title || key)}</h2><p>${escape(p.author)} · ${escape(p.license)}</p><a href="${escape(p.source)}" rel="noreferrer">Источник</a>${p.licenseUrl ? ` · <a href="${escape(p.licenseUrl)}" rel="noreferrer">Лицензия</a>` : ''}<p>${escape(p.modifications)}</p></article>`,
    )
    .join('')}</html>`,
);
console.log(`Built ${Object.keys(manifest).length} versioned photo entries and credits.`);
