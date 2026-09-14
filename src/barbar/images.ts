import type { Cocktail } from './domain/types';

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
export const maxMenuImage = 11 + menuPhotos.length;

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
