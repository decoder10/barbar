import { CatalogImage } from './media/CatalogImage';
import type { Alcohol } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import {
  bottlePhoto,
  menuPhoto,
  photos,
  shotPhoto,
  tinctureIngredient,
  uploadedPhoto,
  type PhotoChoice,
} from './media/photo-catalog';

export function RealPhoto({
  choice,
  name,
  className,
  upload,
  priority,
}: {
  choice: PhotoChoice;
  name: string;
  className: string;
  /** The owner's own photo of this item: shown as is, never labelled as an example. */
  upload?: string;
  priority?: boolean;
}) {
  const own = upload ? uploadedPhoto(upload) : undefined;
  const photo = own || photos[choice.key];
  const example = !own && choice.example;
  return (
    <div
      className={`${className} real-photo ${own ? 'own-photo' : choice.bottle ? 'packshot' : ''}`}
      title={t(photo ? `${name} · ${photo.author}${example ? ' · Пример подачи / упаковки' : ''}` : name)}
    >
      {t(
        photo ? (
          <CatalogImage photo={photo} alt={t(name)} priority={priority} />
        ) : (
          <svg
            className="labelled-bottle"
            viewBox="280 40 470 1440"
            role="img"
            aria-label={t(`${name} — условное изображение`)}
          >
            <image
              href={photos[`generated-${choice.template || 'wine'}`].webp.split(', ').at(-1)?.split(' ')[0]}
              x="0"
              y="0"
              width="1024"
              height="1536"
            />
            <foreignObject x="365" y="815" width="290" height="310">
              <div
                className="generated-label-name"
                style={{ fontSize: name.length > 35 ? 30 : name.length > 22 ? 38 : 49 }}
              >
                {t(name.replace(/·\s*(бутылка|бокал)\s*$/i, '').trim())}
              </div>
            </foreignObject>
          </svg>
        ),
      )}
      {t(
        example && photo && (
          <span className="photo-example">{t(choice.bottle ? 'Пример упаковки' : 'Пример подачи')}</span>
        ),
      )}
    </div>
  );
}

export function CocktailArt({
  image,
  name,
  category,
  serving,
  photo,
  priority,
}: {
  image: number;
  name: string;
  category?: string;
  serving?: string;
  /** The owner's own photo replaces every illustrative composition. */
  photo?: string;
  priority?: boolean;
}) {
  if (photo && uploadedPhoto(photo))
    return (
      <RealPhoto
        choice={{ key: '' }}
        upload={photo}
        name={name}
        className="cocktail-art"
        priority={priority}
      />
    );
  if (category === 'set') {
    const count = Math.min(32, Math.max(1, Number(name.match(/\d+/)?.[0]) || 6));
    return (
      <RealPhoto
        choice={{ key: `shot-set-${[6, 10, 16, 32].includes(count) ? count : 6}`, example: true }}
        name={name}
        className="cocktail-art set-photo"
        priority={priority}
      />
    );
  }
  const ingredient = category === 'tincture' ? tinctureIngredient(name) : undefined;
  if (ingredient)
    return (
      <div className="cocktail-art tincture-composition">
        <RealPhoto
          choice={{ key: shotPhoto(name) }}
          name={name}
          className="tincture-glass"
          priority={priority}
        />
        <CatalogImage className="tincture-fruit" photo={photos[ingredient]} alt={t(`Вкус: ${name}`)} />
      </div>
    );
  return (
    <RealPhoto
      choice={menuPhoto(name, image, category, serving)}
      name={name}
      className="cocktail-art"
      priority={priority}
    />
  );
}

export function BottleArt({
  drink,
  priority,
}: {
  drink: Pick<Alcohol, 'name' | 'color'> & Partial<Pick<Alcohol, 'category' | 'menuCategory' | 'photo'>>;
  priority?: boolean;
}) {
  return (
    <RealPhoto
      choice={bottlePhoto(drink.name, drink.category, drink.menuCategory)}
      upload={drink.photo}
      name={drink.name}
      className="bottle-art"
      priority={priority}
    />
  );
}
