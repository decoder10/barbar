import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { menuImage, menuPhotos, photoGroups, photoGroupsFor } from '../../domain/catalog/legacy-images';
import type { Cocktail } from '../../domain/types';
import { t } from '../../presentation/i18n/runtime';
import { CocktailArt } from '../catalog/art';

/** Collapsed photo choice limited to the category's own sheets. Read-only shows the current photo only. */
export function PhotoPicker({
  value,
  onChange,
  readOnly,
}: {
  value: Pick<Cocktail, 'name' | 'image' | 'category' | 'serving'>;
  onChange: (image: number) => void;
  readOnly?: boolean;
}) {
  const [photoGroup, setPhotoGroup] = useState(() => Math.floor((menuImage(value) - 12) / 16));
  const allowedGroups = photoGroupsFor(value.category);
  const activeGroup = allowedGroups.includes(photoGroup) ? photoGroup : allowedGroups[0];
  const currentPhoto = menuPhotos.find((photo) => photo.id === menuImage(value));
  const summary = (
    <>
      <span className="photo-picker-preview" aria-hidden="true">
        <CocktailArt
          image={menuImage(value)}
          name={value.name || currentPhoto?.name || ''}
          category={value.category}
          serving={value.serving}
        />
      </span>
      <span className="photo-picker-text">
        <strong>{t('Изображение')}</strong>
        <small>{t(currentPhoto?.name || 'Подбирается по названию')}</small>
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
      <p className="form-help">
        {t(
          (value.category || 'cocktail') === 'cocktail'
            ? 'Фотографии напитков. Выберите форму бокала и пример подачи.'
            : 'Для этой категории фото обычно подбирается по названию. Выбор ниже используется, если подходящего фото нет.',
        )}
      </p>
      {allowedGroups.length > 1 && (
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
        {menuPhotos
          .filter((photo) => photo.sheet === activeGroup)
          .map((photo) => (
            <button
              type="button"
              key={photo.id}
              aria-label={t(`Изображение: ${photo.name}`)}
              title={t(photo.name)}
              aria-pressed={menuImage(value) === photo.id}
              className={menuImage(value) === photo.id ? 'selected' : ''}
              onClick={() => onChange(photo.id)}
            >
              <CocktailArt image={photo.id} name={photo.name} />
              <span>{t(photo.name)}</span>
            </button>
          ))}
      </div>
    </details>
  );
}
