import { barConfig } from '../../config';
import type { Cocktail, MenuCategory } from '../types';

export const photoGroups = [
  {
    label: 'Классические коктейли',
    file: 'menu-classics-v2.jpg',
    names: [
      'Gin tonic Beefeater',
      'Gin tonic Bombay',
      'Cuba Libre',
      'Aperol Spritz',
      'Negroni',
      'Coconut cola',
      'Blue Lagoon',
      'White Russian',
      'Gyumri Paloma',
      'Tequila Sunrise',
      'Fruit Jager',
      'Jagermonster',
      'My Honey',
      'Whiskey cola (Jim Beam)',
      'Whiskey cola (Jack Daniels)',
      'Holiday',
    ],
  },
  {
    label: 'Авторские коктейли',
    file: 'menu-signatures-v2.jpg',
    names: [
      'Spring cocktail',
      'Tropical',
      'Underground',
      'Coconut Paradise',
      'Margarita',
      'Daiquiri',
      'BarBar',
      'Bloody Mary',
      'Manhattan',
      'Grachevsky',
      'Armenian kiss',
      'Aragats sling',
      'Spicy kiss',
      'Mr. Lander',
      'Strawberry Daiquiri',
      'Jagerbomb',
    ],
  },
  {
    label: 'Настойки и сеты',
    file: 'menu-tinctures-v2.jpg',
    names: [
      'Слива',
      'Вишня',
      'Абрикос',
      'Персик',
      'Клубника',
      'Малина',
      'Киви',
      'Мандарин',
      'Ириска',
      'Барбариска',
      'Конфеты',
      'Имбирь',
      'Перец',
      'Сет из 6 шотов',
      'Сет из 10 шотов',
      'Большой сет шотов',
    ],
  },
  {
    label: 'Вино, пиво и кафе',
    file: 'menu-cafe-v2.jpg',
    names: [
      'Красное вино',
      'Белое вино',
      'Розовое вино',
      'Игристое вино',
      'Светлое пиво',
      'Стаут',
      'Армянский кофе',
      'Капучино',
      'Чай',
      'Какао',
      'Лимонад',
      'Вода',
      'Чипсы и орехи',
      'Мясная тарелка',
      'Сэндвич',
      'Сыр с мёдом',
    ],
  },
];
export const menuPhotos = photoGroups.flatMap((group, sheet) =>
  group.names.map((name, tile) => ({ id: 12 + sheet * 16 + tile, name, sheet, tile, file: group.file })),
);
/**
 * Photos a name-matched category can pick directly instead of sheet tiles.
 * Append only: the position is the saved image ID, starting right after the sheets.
 */
export const categoryPhotos: { key: string; name: string; category: MenuCategory }[] = [
  { category: 'snack', key: 'snack-sandwich', name: 'Сэндвич' },
  { category: 'snack', key: 'snack-barbar-sandwich', name: 'Сэндвич BarBar' },
  { category: 'snack', key: 'snack-sujuck-sandwich', name: 'Сэндвич с суджуком' },
  { category: 'snack', key: 'snack-brtuch', name: 'Бртуч' },
  { category: 'snack', key: 'snack-cheese-honey', name: 'Сыр с мёдом' },
  { category: 'snack', key: 'snack-cheese-small', name: 'Сыр Микаелян, малый' },
  { category: 'snack', key: 'snack-cheese-large', name: 'Сыр Микаелян, большой' },
  { category: 'snack', key: 'snack-assortment', name: 'Ассорти закусок' },
  { category: 'snack', key: 'snack-sausages-pickles', name: 'Сосиски с соленьями' },
  { category: 'snack', key: 'snack-beer-set', name: 'Пивной сет' },
  { category: 'snack', key: 'snack-sujuck', name: 'Суджук' },
  { category: 'snack', key: 'snack-jerky', name: 'Вяленое мясо' },
  { category: 'snack', key: 'snack-anchovy', name: 'Анчоусы' },
  { category: 'snack', key: 'snack-olives', name: 'Оливки' },
  { category: 'snack', key: 'snack-nuts', name: 'Орехи' },
  { category: 'snack', key: 'snack-pistachios', name: 'Фисташки' },
  { category: 'snack', key: 'snack-chips', name: 'Чипсы' },
  { category: 'snack', key: 'snack-crackers', name: 'Сухарики' },
  { category: 'snack', key: 'snack-lemon', name: 'Лимон' },
  { category: 'snack', key: 'snack-honey', name: 'Мёд' },
  { category: 'wine', key: 'red-wine-glass', name: 'Красное вино' },
  { category: 'wine', key: 'white-wine-glass', name: 'Белое вино' },
  { category: 'wine', key: 'rose-wine-glass', name: 'Розовое вино' },
  { category: 'wine', key: 'mulled-wine', name: 'Глинтвейн' },
  { category: 'beer', key: 'beer-glass', name: 'Светлое пиво' },
  { category: 'beer', key: 'guinness', name: 'Стаут' },
  { category: 'beer', key: 'cider-bottle', name: 'Сидр' },
  { category: 'cognac', key: 'brandy-glass', name: 'Коньяк' },
  { category: 'hot', key: 'coffee-black', name: 'Чёрный кофе' },
  { category: 'hot', key: 'coffee-armenian', name: 'Армянский кофе' },
  { category: 'hot', key: 'cappuccino', name: 'Капучино' },
  { category: 'hot', key: 'coffee-milk', name: 'Кофе с молоком' },
  { category: 'hot', key: 'coffee-iced', name: 'Холодный кофе' },
  { category: 'hot', key: 'coffee-milk-iced', name: 'Холодный кофе с молоком' },
  { category: 'hot', key: 'coffee-irish', name: 'Ирландский кофе' },
  { category: 'hot', key: 'tea-black', name: 'Чёрный чай' },
  { category: 'hot', key: 'tea-green', name: 'Зелёный чай' },
  { category: 'hot', key: 'tea-mint', name: 'Чай с мятой' },
  { category: 'hot', key: 'tea-hibiscus', name: 'Каркаде' },
  { category: 'hot', key: 'tea-fruit', name: 'Фруктовый чай' },
  { category: 'hot', key: 'tea-cinnamon', name: 'Чай с корицей' },
  { category: 'hot', key: 'cocoa-cup', name: 'Какао' },
  { category: 'hot', key: 'mulled-wine', name: 'Глинтвейн' },
  { category: 'soft', key: 'lemonade', name: 'Лимонад' },
  { category: 'soft', key: 'juice-glass', name: 'Сок' },
  { category: 'soft', key: 'water-glass', name: 'Вода' },
  { category: 'soft', key: 'water-bottle', name: 'Вода в бутылке' },
  { category: 'soft', key: 'jermuk', name: 'Джермук' },
  { category: 'soft', key: 'cola-bottle', name: 'Кола' },
  { category: 'soft', key: 'fanta', name: 'Фанта' },
  { category: 'soft', key: 'sprite', name: 'Спрайт' },
  { category: 'soft', key: 'tonic', name: 'Тоник' },
  { category: 'soft', key: 'energy-drink', name: 'Энергетик' },
];
const firstCategoryPhoto = 12 + menuPhotos.length;
export const maxMenuImage = firstCategoryPhoto + categoryPhotos.length - 1;
/** The photo key of a direct category choice, or undefined for sheet and legacy IDs. */
export const choicePhotoKey = (image: number): string | undefined =>
  categoryPhotos[image - firstCategoryPhoto]?.key;
export const categoryPhotosFor = (category?: MenuCategory) =>
  categoryPhotos
    .map((photo, index) => ({ ...photo, id: firstCategoryPhoto + index }))
    .filter((photo) => photo.category === (category || 'cocktail'));
/** Photo sheets relevant to one menu category: cocktails have classic and signature sheets. */
export const photoGroupsFor = (category?: MenuCategory): number[] =>
  barConfig.menu.categories.find((c) => c.id === (category || 'cocktail'))?.photoSheets || [];

// Legacy 0–11 choices get a matching photo without rewriting saved recipes or sales.
export function menuImage(cocktail: Pick<Cocktail, 'name' | 'image' | 'category'>): number {
  if (cocktail.image >= 12 && cocktail.image <= maxMenuImage) return cocktail.image;
  const name = cocktail.name.toLowerCase();
  const category = cocktail.category || 'cocktail';
  const exact = menuPhotos.find((p) => p.name.toLowerCase() === name);
  if (exact && (category === 'cocktail' || category === 'tincture')) return exact.id;
  if (category === 'cocktail') {
    const variants: Record<string, number> = {
      'bloody mary barbar': 35,
      'manhattan barbar': 36,
      'nastoyka cocktail': 44,
      'armenian wife': 28,
      'armenian husband': 37,
      'armenian mother-in-law': 40,
      'clover club': 28,
      'whiskey sour': 24,
      gyumri: 39,
      alexandropol: 38,
      leninakan: 30,
      'your cocktail': 32,
      special: 34,
    };
    return variants[name] ?? 12;
  }
  if (category === 'set') return name.includes('6 shots') ? 57 : name.includes('10 shots') ? 58 : 59;
  if (category === 'shot') {
    if (name.includes('mint')) return 50;
    if (name.includes('spicy')) return 56;
    if (name.includes('peach')) return 47;
    if (name.includes('pink')) return 54;
    if (name.includes('barbar')) return 45;
    if (name.includes('street')) return 51;
    if (name.includes('photo')) return 49;
    return 55;
  }
  if (category === 'wine') {
    if (/pet nat/.test(name)) return 63;
    if (/rose|roze/.test(name)) return 62;
    return /white|muskat|kharji|apricot/.test(name) ? 61 : 60;
  }
  if (category === 'beer') return /guinness/.test(name) ? 65 : 64;
  if (category === 'snack') {
    if (/cheese|honey/.test(name)) return 75;
    if (/sandwich|brtuch/.test(name)) return 74;
    if (/jerky|sujuck|sausage|anchovy|beer set/.test(name)) return 73;
    return 72;
  }
  if (category === 'hot') {
    if (/tea/.test(name)) return 68;
    if (/cocoa|chocolate/.test(name)) return 69;
    if (/cappuccino|milk/.test(name)) return 67;
    if (/glentwine/.test(name)) return 60;
    return 66;
  }
  if (category === 'soft') {
    if (/water|jermuk/.test(name)) return 71;
    if (/cola/.test(name)) return 14;
    return 70;
  }
  return 12;
}
