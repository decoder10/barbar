export interface Photo {
  file: string;
  author: string;
  width: number;
  height: number;
  webp: string;
  avif: string;
}
type ManifestEntry = [
  file: string,
  author: number,
  width: number,
  height: number,
  webp: string,
  avif: string,
];
/** The compact format written by `scripts/photo-manifest.mjs`: authors once, entries by photo key. */
export interface PhotoManifest {
  a: string[];
  p: Record<string, unknown>;
}
// `scripts/photo-manifest.mjs` stores each variant as `<width>.<hash>` to keep the shared chunk small.
const srcSet = (key: string, format: 'webp' | 'avif', variants: string) =>
  variants
    ? variants
        .split(' ')
        .map((variant) => {
          const [width, hash] = variant.split('.');
          return `/barbar/photos/optimized/${key}-${width}-${hash}.${format} ${width}w`;
        })
        .join(', ')
    : '';
export const expandPhotos = (manifest: PhotoManifest): Record<string, Photo> =>
  Object.fromEntries(
    Object.entries(manifest.p as Record<string, ManifestEntry>).map(
      ([key, [file, author, width, height, webp, avif]]) => [
        key,
        {
          file: file.startsWith('/') ? file : `/barbar/photos/${key}.webp?v=${file}`,
          author: manifest.a[author],
          width,
          height,
          webp: srcSet(key, 'webp', webp),
          avif: srcSet(key, 'avif', avif),
        },
      ],
    ),
  );
