import { expect, test } from 'vitest';
import {
  categoryPhotos,
  categoryPhotosFor,
  maxMenuImage,
  menuImage,
} from '../../../../domain/catalog/legacy-images';
import { menuPhoto, photos } from '../photo-catalog';

test('category photo choices are bundled, keep saved IDs and win over name matching', () => {
  for (const photo of categoryPhotos) expect(photos[photo.key], photo.key).toBeDefined();
  // IDs are stored in recipes: the first direct choice follows the four 16-tile sheets.
  expect(categoryPhotosFor('snack')[0]).toMatchObject({ id: 76, key: 'snack-sandwich' });
  expect(maxMenuImage).toBe(75 + categoryPhotos.length);
  expect(categoryPhotosFor('snack').every((photo) => photo.key.startsWith('snack-'))).toBe(true);
  expect(categoryPhotosFor('wine').map((photo) => photo.key)).not.toContain('snack-sandwich');

  const cheese = categoryPhotosFor('snack').find((photo) => photo.key === 'snack-cheese-honey')!;
  expect(menuImage({ name: 'BarBar sandwich', image: cheese.id, category: 'snack' })).toBe(cheese.id);
  expect(menuPhoto('BarBar sandwich', cheese.id, 'snack').key).toBe('snack-cheese-honey');
  // Legacy sheet IDs and 0 keep matching by name.
  expect(menuPhoto('BarBar sandwich', 74, 'snack').key).toBe('snack-barbar-sandwich');
  expect(
    menuPhoto('BarBar sandwich', menuImage({ name: 'BarBar sandwich', image: 0, category: 'snack' }), 'snack')
      .key,
  ).toBe('snack-barbar-sandwich');
});
