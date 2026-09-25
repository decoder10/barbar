import { describe, expect, it } from 'vitest';
import { migrateBottleCatalog } from '../catalog/bottles';
import { uploadedPhotoWidths, withPhoto } from '../catalog/uploaded-photos';
import { guestMenu } from '../guest-menu';
import { applyCommand, initialData } from '../model';

const photo = 'u-0123456789ab-640x960';

describe('owner photos on catalog items', () => {
  it('stores only a valid photo name on menu and stock items, and clears it when removed', () => {
    const data = initialData();
    const cocktail = data.cocktails.find((c) => c.price > 0 && !c.stockAlcoholId)!;
    const saved = applyCommand(data, { id: 'photo-1', type: 'cocktail', value: { ...cocktail, photo } });
    expect(saved.cocktails.find((c) => c.id === cocktail.id)!.photo).toBe(photo);
    for (const bad of ['../../etc/passwd', 'u-0123456789ab-640x960.webp', 'https://evil.test/a.webp', 42])
      expect(() =>
        applyCommand(data, {
          id: 'photo-bad',
          type: 'cocktail',
          value: { ...cocktail, photo: bad as string },
        }),
      ).toThrow();
    const current = saved.cocktails.find((c) => c.id === cocktail.id)!;
    const cleared = applyCommand(saved, { id: 'photo-2', type: 'cocktail', value: withPhoto(current) });
    expect('photo' in cleared.cocktails.find((c) => c.id === cocktail.id)!).toBe(false);
    const drink = data.alcohol.find((a) => a.category === 'alcohol')!;
    const stocked = applyCommand(data, { id: 'photo-3', type: 'alcohol', value: { ...drink, photo } });
    expect(stocked.alcohol.find((a) => a.id === drink.id)!.photo).toBe(photo);
    expect(() =>
      applyCommand(data, { id: 'photo-4', type: 'alcohol', value: { ...drink, photo: 'u-xyz' } }),
    ).toThrow();
  });

  it('is not settable by the staff create command', () => {
    const data = initialData();
    const created = applyCommand(data, {
      id: 'staff-new',
      type: 'createCocktail',
      value: { name: 'Staff special', image: 0, ingredients: [], photo } as never,
    });
    expect(created.cocktails.find((c) => c.id === 'staff-new')!.photo).toBeUndefined();
  });

  it('reaches the public menu by name only, the glass photo leading a merged wine', () => {
    const data = migrateBottleCatalog(initialData());
    const poured = data.alcohol.find(
      (a) => a.category === 'alcohol' && a.pricePerLiter > 0 && !a.guestHidden,
    )!;
    const items = (value: typeof data) => guestMenu(value, 'rev').sections.flatMap((s) => s.items);
    const wine = items(data).find((i) => i.name === 'Volcani red dry Haghtanak')!;
    const glassId = wine.prices.find((p) => p.kind === 'glass')!.productId;
    const bottleId = wine.prices.find((p) => p.kind === 'bottle')!.productId;
    const withPhotos = (photos: Record<string, string>) =>
      items({
        ...data,
        cocktails: data.cocktails.map((c) => (photos[c.id] ? { ...c, photo: photos[c.id] } : c)),
        alcohol: data.alcohol.map((a) => (photos[a.id] ? { ...a, photo: photos[a.id] } : a)),
      });
    const bottleOnly = withPhotos({ [bottleId!]: photo, [poured.id]: photo });
    expect(bottleOnly.find((i) => i.name === wine.name)!.photo).toBe(photo);
    expect(bottleOnly.find((i) => i.id === poured.id)!.photo).toBe(photo);
    const glassPhoto = 'u-ba9876543210-640x480';
    expect(
      withPhotos({ [bottleId!]: photo, [glassId!]: glassPhoto }).find((i) => i.name === wine.name)!.photo,
    ).toBe(glassPhoto);
    expect(items(data).some((i) => 'photo' in i)).toBe(false);
  });

  it('keeps every stored width no larger than the photo', () => {
    expect(uploadedPhotoWidths(640)).toEqual([160, 320, 640]);
    expect(uploadedPhotoWidths(480)).toEqual([160, 320, 480]);
    expect(uploadedPhotoWidths(200)).toEqual([160, 200]);
    expect(uploadedPhotoWidths(160)).toEqual([160]);
  });
});
