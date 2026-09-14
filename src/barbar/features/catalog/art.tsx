import type { Alcohol } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import {
  bottlePhoto,
  menuPhoto,
  photos,
  shotPhoto,
  tinctureIngredient,
  type PhotoChoice,
} from './media/photo-catalog';

export function RealPhoto({
  choice,
  name,
  className,
}: {
  choice: PhotoChoice;
  name: string;
  className: string;
}) {
  const photo = photos[choice.key];
  return (
    <div
      className={`${className} real-photo ${choice.bottle ? 'packshot' : ''}`}
      title={t(
        photo ? `${name} · ${photo.author}${choice.example ? ' · Пример подачи / упаковки' : ''}` : name,
      )}
    >
      {t(
        photo ? (
          <img src={photo.file} alt={t(name)} loading="lazy" decoding="async" />
        ) : (
          <svg
            className="labelled-bottle"
            viewBox="280 40 470 1440"
            role="img"
            aria-label={t(`${name} — условное изображение`)}
          >
            <image
              href={`/barbar/photos/generated-${choice.template || 'wine'}.webp`}
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
        choice.example && photo && (
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
}: {
  image: number;
  name: string;
  category?: string;
  serving?: string;
}) {
  if (category === 'set') {
    const count = Math.min(32, Math.max(1, Number(name.match(/\d+/)?.[0]) || 6));
    return (
      <RealPhoto
        choice={{ key: `shot-set-${[6, 10, 16, 32].includes(count) ? count : 6}`, example: true }}
        name={name}
        className="cocktail-art set-photo"
      />
    );
  }
  const ingredient = category === 'tincture' ? tinctureIngredient(name) : undefined;
  if (ingredient)
    return (
      <div className="cocktail-art tincture-composition">
        <RealPhoto choice={{ key: shotPhoto(name) }} name={name} className="tincture-glass" />
        <img
          className="tincture-fruit"
          src={photos[ingredient].file}
          alt={t(`Вкус: ${name}`)}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  return (
    <RealPhoto choice={menuPhoto(name, image, category, serving)} name={name} className="cocktail-art" />
  );
}

export function BottleArt({
  drink,
}: {
  drink: Pick<Alcohol, 'name' | 'color'> & Partial<Pick<Alcohol, 'category'>>;
}) {
  return (
    <RealPhoto choice={bottlePhoto(drink.name, drink.category)} name={drink.name} className="bottle-art" />
  );
}
