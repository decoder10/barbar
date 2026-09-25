import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  categoryPhotosFor,
  menuImage,
  menuPhotos,
  photoGroups,
  photoGroupsFor,
} from '../../domain/catalog/legacy-images';
import type { Cocktail } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { CocktailArt } from '../catalog/art';
import { OwnPhotoField } from '../catalog/media/OwnPhotoField';

/**
 * Collapsed photo choice limited to the category's own photos. Read-only shows the current photo only.
 * With `onPhoto` (owner) the item can also carry its own uploaded photo, which replaces the library one.
 */
export function PhotoPicker({
  value,
  onChange,
  onPhoto,
  readOnly,
}: {
  value: Pick<Cocktail, 'name' | 'image' | 'category' | 'serving'> & Partial<Pick<Cocktail, 'photo'>>;
  onChange: (image: number) => void;
  onPhoto?: (photo: string | undefined) => void;
  readOnly?: boolean;
}) {
  const [photoGroup, setPhotoGroup] = useState(() => Math.floor((menuImage(value) - 12) / 16));
  const allowedGroups = photoGroupsFor(value.category);
  const activeGroup = allowedGroups.includes(photoGroup) ? photoGroup : allowedGroups[0];
  // Name-matched categories list their own photos; the first tile keeps matching by name.
  const ownPhotos = categoryPhotosFor(value.category);
  const options = ownPhotos.length ? ownPhotos : menuPhotos.filter((photo) => photo.sheet === activeGroup);
  const currentPhoto = options.find((photo) => photo.id === menuImage(value));
  const own = !!value.photo;
  const byName = !own && ownPhotos.length > 0 && !currentPhoto;
  const summary = (
    <>
      <span className="photo-picker-preview" aria-hidden="true">
        <CocktailArt
          image={menuImage(value)}
          name={value.name || currentPhoto?.name || ''}
          category={value.category}
          serving={value.serving}
          photo={value.photo}
        />
      </span>
      <span className="photo-picker-text">
        <strong>{t('Изображение')}</strong>
        <small>{t(own ? 'Своё фото' : currentPhoto?.name || 'Подбирается по названию')}</small>
      </span>
    </>
  );
  if (readOnly) return <div className="photo-picker photo-picker-readonly">{summary}</div>;
  return (
    <details className="photo-picker">
      <summary>
        {summary}
        <ChevronDown size={16} className="photo-picker-chevron" aria-hidden="true" />
      </summary>
      {onPhoto && <OwnPhotoField photo={value.photo} onChange={onPhoto} />}
      <p className="form-help">
        {t(
          ownPhotos.length
            ? 'Выберите фото из этой категории или оставьте подбор по названию.'
            : 'Фотографии напитков. Выберите форму бокала и пример подачи.',
        )}
      </p>
      {allowedGroups.length > 1 && !ownPhotos.length && (
        <div className="photo-group-tabs">
          {allowedGroups.map((index) => (
            <button
              type="button"
              key={photoGroups[index].file}
              aria-pressed={activeGroup === index}
              className={activeGroup === index ? 'selected' : ''}
              onClick={() => setPhotoGroup(index)}
            >
              {t(photoGroups[index].label)}
            </button>
          ))}
        </div>
      )}
      <div className="image-options">
        {ownPhotos.length > 0 && (
          <button
            type="button"
            aria-label={t('Изображение: По названию')}
            title={t('По названию')}
            aria-pressed={byName}
            className={byName ? 'selected' : ''}
            onClick={() => onChange(0)}
          >
            <CocktailArt image={0} name={value.name} category={value.category} serving={value.serving} />
            <span>{t('По названию')}</span>
          </button>
        )}
        {options.map((photo) => (
          <button
            type="button"
            key={photo.id}
            aria-label={t(`Изображение: ${photo.name}`)}
            title={t(photo.name)}
            aria-pressed={!own && menuImage(value) === photo.id}
            className={!own && menuImage(value) === photo.id ? 'selected' : ''}
            onClick={() => onChange(photo.id)}
          >
            <CocktailArt image={photo.id} name={photo.name} category={value.category} />
            <span>{t(photo.name)}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
