import type { Photo } from './photo-catalog';

/** Native lazy sizing uses the rendered width, including small warehouse rows. */
export function CatalogImage({
  photo,
  alt,
  className,
  eager = false,
  priority = false,
}: {
  photo: Photo;
  alt: string;
  className?: string;
  eager?: boolean;
  /** A card photo in the first screen: fetched with the page instead of after layout, card sizes kept. */
  priority?: boolean;
}) {
  const sizes = eager ? '180px' : 'auto, (max-width: 600px) 90vw, 320px';
  const urgent = eager || priority;
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
        loading={urgent ? 'eager' : 'lazy'}
        // The first-screen logo and card photos are LCP candidates: ask for them before the lazy ones.
        fetchPriority={urgent ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  );
}
