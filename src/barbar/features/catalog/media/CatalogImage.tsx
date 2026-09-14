import type { Photo } from './photo-catalog';

/** Native lazy sizing uses the rendered width, including small warehouse rows. */
export function CatalogImage({
  photo,
  alt,
  className,
  eager = false,
}: {
  photo: Photo;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const sizes = eager ? '180px' : 'auto, (max-width: 600px) 90vw, 320px';
  return (
    <picture className="catalog-picture">
      {photo.avif && <source type="image/avif" srcSet={photo.avif} sizes={sizes} />}
      <img
        className={className}
        src={photo.file}
        srcSet={photo.webp}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  );
}
