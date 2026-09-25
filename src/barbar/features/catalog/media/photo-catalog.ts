import { choicePhotoKey } from '../../../domain/catalog/legacy-images';
import {
  uploadedPhotoSize,
  uploadedPhotoUrl,
  uploadedPhotoWidths,
} from '../../../domain/catalog/uploaded-photos';
import manifest from './photo-manifest.json';
export interface Photo {
  file: string;
  author: string;
  width: number;
  height: number;
  webp: string;
  avif: string;
}
type ManifestEntry = [
  file: string,
  author: number,
  width: number,
  height: number,
  webp: string,
  avif: string,
];
// `scripts/photo-manifest.mjs` stores each variant as `<width>.<hash>` to keep the shared chunk small.
const srcSet = (key: string, format: 'webp' | 'avif', variants: string) =>
  variants
    ? variants
        .split(' ')
        .map((variant) => {
          const [width, hash] = variant.split('.');
          return `/barbar/photos/optimized/${key}-${width}-${hash}.${format} ${width}w`;
        })
        .join(', ')
    : '';
export const photos: Record<string, Photo> = Object.fromEntries(
  Object.entries(manifest.p as unknown as Record<string, ManifestEntry>).map(
    ([key, [file, author, width, height, webp, avif]]) => [
      key,
      {
        file: file.startsWith('/') ? file : `/barbar/photos/${key}.webp?v=${file}`,
        author: manifest.a[author],
        width,
        height,
        webp: srcSet(key, 'webp', webp),
        avif: srcSet(key, 'avif', avif),
      },
    ],
  ),
);
/** The owner's own photo, served from file storage by name; the author is the venue itself. */
export function uploadedPhoto(name: string): Photo | undefined {
  const size = uploadedPhotoSize(name);
  if (!size) return undefined;
  return {
    file: uploadedPhotoUrl(name, size.width),
    author: 'Фото заведения',
    width: size.width,
    height: size.height,
    webp: uploadedPhotoWidths(size.width)
      .map((width) => `${uploadedPhotoUrl(name, width)} ${width}w`)
      .join(', '),
    avif: '',
  };
}
export interface PhotoChoice {
  key: string;
  example?: boolean;
  bottle?: boolean;
  template?: 'beer' | 'wine';
}
export function bottlePhoto(name: string, category = '', menuCategory?: string): PhotoChoice {
  // Goods show the real product: packaged snacks reuse product photos, drinks their menu packshot.
  if (category === 'goods') {
    const product = (menuCategory || 'soft') === 'snack' ? goodsSnackPhoto(name) : undefined;
    return product && photos[product] ? { key: product } : menuPhoto(name, 0, menuCategory || 'soft');
  }
  // Snack products show the raw product; unknown ones fall back to an illustrative serving.
  if (category === 'food') {
    const key = foodPhoto(name);
    return key && photos[key] ? { key } : { key: snackPhoto(name), example: true };
  }
  const n = name.toLowerCase();
  let key = '';
  if (/379/.test(n)) {
    if (/pilsner/.test(n)) key = '379-pilsner';
    else if (/вишн|cherry/.test(n)) key = '379-cherry';
    else if (/citrus|цитрус|american|wheat ale/.test(n)) key = '379-citrus';
    else if (/weizen/.test(n)) key = '379-weizen';
    else if (/dankel|dunkel/.test(n)) key = '379-dunkel';
  } else if (/voskeni/.test(n)) {
    key = /volcani.*haghtanak/.test(n)
      ? 'voskeni-haghtanak'
      : /volcani.*tozot/.test(n)
        ? 'voskeni-tozot'
        : /kangun/.test(n)
          ? 'voskeni-kangun'
          : /kharji|siro melody/.test(n)
            ? 'voskeni-siro'
            : /voskehat/.test(n)
              ? 'voskeni-voskehat'
              : /rose/.test(n)
                ? 'voskeni-rose'
                : /areni/.test(n)
                  ? 'voskeni-areni'
                  : '';
  } else if (/tushpa/.test(n)) {
    key = /pet nat/.test(n)
      ? /lalvar/.test(n)
        ? 'tushpa-lalvari'
        : /banan/.test(n)
          ? 'tushpa-banants'
          : /tozot.*roze/.test(n)
            ? 'tushpa-tozot-rose'
            : /tozot/.test(n)
              ? 'tushpa-tozot'
              : /koghbeni/.test(n)
                ? 'tushpa-koghbeni'
                : /chrchuk/.test(n)
                  ? 'tushpa-jrjruk'
                  : ''
      : /reserve/.test(n)
        ? 'tushpa-reserve'
        : /muskat/.test(n)
          ? 'tushpa-muscat'
          : /white|kangun/.test(n)
            ? 'tushpa-white'
            : 'tushpa-red';
  } else if (/vayk|zakare|kars city/.test(n)) {
    key = /zakare.*pomegranate.*reserve/.test(n)
      ? 'vayk-zakare-pomegranate-reserve'
      : /zakare.*pomegranate/.test(n)
        ? 'vayk-zakare-pomegranate'
        : /zakare.*apricot/.test(n)
          ? 'vayk-zakare-apricot'
          : /zakare.*cherry/.test(n)
            ? 'vayk-zakare-cherry'
            : /kars.*white/.test(n)
              ? 'vayk-kars-white'
              : /kars.*red/.test(n)
                ? 'vayk-kars-red'
                : '';
  } else if (/ararat.*brandy|ararat.*coffee|ararat.*honey|ararat.*cherry/.test(n) || category === 'cognac') {
    key = /coffee/.test(n)
      ? 'ararat-coffee'
      : /honey/.test(n)
        ? 'ararat-honey'
        : /cherry/.test(n)
          ? 'ararat-cherry'
          : 'ararat-bottle';
  } else {
    const brands: [RegExp, string][] = [
      [/ararat|арарат/, 'ararat-beer'],
      [/gyumri|гюмри/, 'gyumri'],
      [/alexandropol|alexandrapol|aleksandrapol|александ/, 'alexandropol'],
      [/bacardi.*(?:dark|тём|черн)/, 'bacardi-dark'],
      [/bacardi/, 'bacardi-white'],
      [/beefeater/, 'beefeater'],
      [/bombay/, 'bombay'],
      [/jim beam apple/, 'jim-apple'],
      [/jim beam/, 'jim-beam'],
      [/jack.*honey/, 'jack-honey'],
      [/jack.*daniel/, 'jack-daniels'],
      [/jameson/, 'jameson'],
      [/jager|jäger/, 'jagermeister'],
      [/becherovka/, 'becherovka'],
      [/campari/, 'campari'],
      [/aperol/, 'aperol'],
      [/martini/, 'martini'],
      [/guinness/, 'guinness'],
      [/kozel/, 'kozel'],
      [/blanc/, 'blanc'],
      [/volkov|волков/, 'volkovskaya-ipa'],
      [/cider|сидр/, 'cider-bottle'],
      [/german beer|немецк/, 'german-beer'],
    ];
    key = brands.find(([match]) => match.test(n))?.[1] || '';
  }
  // Generic entries show a typical bottle, not necessarily the bar's brand.
  if (key && photos[key])
    return { key, bottle: true, ...(['cider-bottle', 'german-beer'].includes(key) ? { example: true } : {}) };
  if (['beer', 'wine', 'cognac'].includes(category) || /379|voskeni|tushpa|vayk/.test(n))
    return { key: '', bottle: true, template: category === 'beer' || /379/.test(n) ? 'beer' : 'wine' };
  const ingredients: [RegExp, string][] = [
    [/сахар/, 'sugar'],
    [/вишн/, 'cherry'],
    [/имбир/, 'ginger'],
    [/перец/, 'pepper'],
    [/лайм/, 'lime'],
    [/лимон/, 'lemon'],
    [/апельсин/, 'orange'],
    [/грейпфрут/, 'grapefruit'],
    [/ананасовый сок/, 'pineapple-juice'],
    [/ананас/, 'pineapple'],
    [/клубник/, 'strawberry'],
    [/малин/, 'raspberry'],
    [/сливки/, 'cream'],
    [/слива/, 'plum'],
    [/абрикос/, 'apricot'],
    [/персик/, 'peach'],
    [/киви/, 'kiwi'],
    [/мандарин/, 'mandarin'],
    [/мята/, 'mint'],
    [/лёд/, 'ice'],
    [/мёд/, 'honey'],
    [/соль/, 'salt'],
    [/кориц/, 'cinnamon'],
    [/кофе/, 'coffee-beans'],
    [/чай/, 'tea-leaves'],
    [/какао/, 'cocoa'],
    [/кокосовое молоко/, 'coconut-milk'],
    [/молоко/, 'milk'],
    [/томатный сок/, 'tomato-juice'],
    [/гренадин/, 'grenadine'],
    [/яичный белок/, 'egg'],
    [/сельдерей/, 'celery'],
    [/ириск/, 'caramel'],
    [/конфет/, 'candy'],
    [/барбарис/, 'barberry'],
    [/кола/, 'cola-bottle'],
    [/тоник/, 'tonic'],
    [/содов/, 'water-bottle'],
    [/vodka/, 'vodka-bottle'],
    [/tequila/, 'tequila-bottle'],
  ];
  key = ingredients.find(([match]) => match.test(n))?.[1] || '';
  if (key && photos[key]) return { key };
  return {
    key: '',
    example: true,
    bottle: true,
    template: /beer|пиво|cider|ipa|blanc|gyumri|alexandropol|lager|pilsner/.test(n) ? 'beer' : 'wine',
  };
}
// Keep existing numeric image choices compatible with stored recipes.
export const servingPhotos = [
  'gin-tonic',
  'gin-tonic',
  'cuba-libre',
  'aperol-spritz',
  'negroni',
  'cuba-libre',
  'blue-lagoon',
  'white-russian',
  'paloma',
  'tequila-sunrise',
  'whiskey-sour',
  'cuba-libre',
  'whiskey-sour',
  'cuba-libre',
  'cuba-libre',
  'paloma',
  'clover-club',
  'pina-colada',
  'negroni',
  'pina-colada',
  'margarita',
  'daiquiri',
  'clover-club',
  'bloody-mary',
  'manhattan',
  'negroni',
  'clover-club',
  'paloma',
  'bloody-mary',
  'whiskey-sour',
  'strawberry-daiquiri',
  'jagerbomb',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot',
  'shot-set',
  'shot-set',
  'shot-set',
  'red-wine-glass',
  'white-wine-glass',
  'rose-wine-glass',
  'rose-wine-glass',
  'beer-glass',
  'beer-glass',
  'coffee',
  'cappuccino',
  'tea-cup',
  'cocoa-cup',
  'lemonade',
  'water-glass',
  'snack',
  'cheese',
  'sandwich',
  'cheese',
];
export function menuPhoto(name: string, image: number, category?: string, serving?: string): PhotoChoice {
  // A photo picked from the category's own list wins over matching by name.
  const chosen = choicePhotoKey(image);
  if (chosen && photos[chosen]) {
    const product = ['cola-bottle', 'fanta', 'sprite', 'jermuk', 'tonic'].includes(chosen);
    return {
      key: chosen,
      bottle: product || ['water-bottle', 'energy-drink', 'cider-bottle'].includes(chosen),
      example: !product,
    };
  }
  const n = name.toLowerCase();
  const glass = serving === 'glass' || /·\s*бокал/.test(n);
  const bottle = serving === 'bottle' || /·\s*бутылка/.test(n) || category === 'beer';
  if (bottle && !glass) return bottlePhoto(name, category);
  if (category === 'alcohol') return bottlePhoto(name, category);
  if (category === 'wine' || (glass && /voskeni|tushpa|vayk/.test(n)))
    return {
      key: /rose|roze/.test(n)
        ? 'rose-wine-glass'
        : /white|muskat|kharji|apricot/.test(n)
          ? 'white-wine-glass'
          : 'red-wine-glass',
      example: true,
    };
  if (category === 'cognac' || (glass && /ararat/.test(n))) return { key: 'brandy-glass', example: true };
  if (category === 'shot' || category === 'tincture') return { key: shotPhoto(name), example: true };
  if (category === 'snack') return { key: snackPhoto(name), example: true };
  if (category === 'hot') {
    const key = /green/.test(n)
      ? 'tea-green'
      : /hibiscus/.test(n)
        ? 'tea-hibiscus'
        : /mint/.test(n)
          ? 'tea-mint'
          : /cinnamon/.test(n)
            ? 'tea-cinnamon'
            : /fruit.*tea/.test(n)
              ? 'tea-fruit'
              : /tea/.test(n)
                ? 'tea-black'
                : /cocoa|chocolate/.test(n)
                  ? 'cocoa-cup'
                  : /cappuccino/.test(n)
                    ? 'cappuccino'
                    : /glent|mulled/.test(n)
                      ? 'mulled-wine'
                      : /armenian/.test(n)
                        ? 'coffee-armenian'
                        : /alcohol/.test(n)
                          ? 'coffee-irish'
                          : /milk/.test(n)
                            ? /cold/.test(n)
                              ? 'coffee-milk-iced'
                              : 'coffee-milk'
                            : /cold/.test(n)
                              ? 'coffee-iced'
                              : 'coffee-black';
    return { key, example: true };
  }
  if (category === 'soft') {
    const key = /lemonade|лимонад/.test(n)
      ? 'lemonade'
      : /juice/.test(n)
        ? 'juice-glass'
        : /^(cola|кола)$/.test(n)
          ? 'cola-bottle'
          : /fanta|фанта/.test(n)
            ? 'fanta'
            : /sprite|спрайт/.test(n)
              ? 'sprite'
              : /tonic|тоник/.test(n)
                ? 'tonic'
                : /jermuk|джермук/.test(n)
                  ? 'jermuk'
                  : /energy|энергет|red bull/.test(n)
                    ? 'energy-drink'
                    : 'water-bottle';
    if (photos[key])
      return {
        key,
        bottle: !['lemonade', 'juice-glass'].includes(key),
        example: !['cola-bottle', 'fanta', 'sprite', 'jermuk', 'tonic'].includes(key),
      };
  }
  const key = servingPhotos[image - 12] || 'gin-tonic';
  return {
    key: photos[key] ? key : key === 'shot-set' ? 'shot' : key === 'lemonade' ? 'water-glass' : 'gin-tonic',
    example: true,
  };
}

const snackPhotos: [RegExp, string][] = [
  [/mikayelyan.*large|микаел.*больш/i, 'snack-cheese-large'],
  [/mikayelyan|микаел/i, 'snack-cheese-small'],
  [/cheese|сыр/i, 'snack-cheese-honey'],
  [/sandwich.*suj|сэндвич.*судж|сандвич.*судж/i, 'snack-sujuck-sandwich'],
  [/barbar.*sandwich|барбар.*(?:сэндвич|сандвич)/i, 'snack-barbar-sandwich'],
  [/sandwich|сэндвич|сандвич/i, 'snack-sandwich'],
  [/brtuch|бруч|бртуч/i, 'snack-brtuch'],
  [/mini.*sausage|сосиск|колбаск/i, 'snack-sausages-pickles'],
  [/beer.*set|пивн.*(?:сет|набор)/i, 'snack-beer-set'],
  [/snack.*set|(?:сет|набор).*закус/i, 'snack-assortment'],
  [/sujuck|sujuk|судж/i, 'snack-sujuck'],
  [/anchov|анчоус/i, 'snack-anchovy'],
  [/jerky|джерки|вялен.*мяс/i, 'snack-jerky'],
  [/pistachio|фисташ/i, 'snack-pistachios'],
  [/nuts|орех/i, 'snack-nuts'],
  [/chips|чипс/i, 'snack-chips'],
  [/cracker|сухар|крекер/i, 'snack-crackers'],
  [/oliv|олив|маслин/i, 'snack-olives'],
  [/lemon|лимон/i, 'snack-lemon'],
  [/honey|м[её]д/i, 'snack-honey'],
  [/lavash|лаваш/i, 'snack-brtuch'],
  [/bread|хлеб/i, 'snack-sandwich'],
];

const foodPhotos: [RegExp, string][] = [
  [/лаваш|lavash/i, 'food-lavash'],
  [/хлеб|bread/i, 'food-bread'],
  [/микаел|лори|mikayel|lori/i, 'food-mikayelyan'],
  [/сыр|cheese/i, 'food-cheese'],
  [/судж|sujuk|sucuk/i, 'food-sujuk'],
  [/колбас|сосис|sausage/i, 'food-sausages'],
  [/вялен|jerky/i, 'food-jerky'],
  [/анчоус|anchov/i, 'food-anchovy'],
  [/олив|маслин|olive/i, 'food-olives'],
  [/маринов|солён|солен|корнишон|pickle/i, 'food-pickles'],
  [/помидор|томат|tomato/i, 'food-tomato'],
  [/огур|cucumber/i, 'food-cucumber'],
  [/зелен|петрушк|укроп|кинз|herb|greens/i, 'food-greens'],
  [/соус|кетчуп|sauce|ketchup/i, 'food-sauce'],
  [/масло|butter/i, 'food-butter'],
  [/чипс|chips|crisps/i, 'food-chips'],
  [/фисташ|pistach/i, 'food-pistachios'],
  [/орех|nuts/i, 'food-nuts'],
  [/крекер|сухар|cracker/i, 'food-crackers'],
];
export const foodPhoto = (name: string) => foodPhotos.find(([pattern]) => pattern.test(name))?.[1];
/** Packaged or portioned snacks sold whole: real product photos instead of serving illustrations. */
export const goodsSnackPhoto = (name: string) =>
  /lemon|лимон/i.test(name)
    ? 'lemon'
    : /honey|м[её]д/i.test(name)
      ? 'honey'
      : /pistach|фисташ/i.test(name)
        ? 'food-pistachios'
        : foodPhoto(name);

export function snackPhoto(name: string): string {
  return snackPhotos.find(([pattern]) => pattern.test(name))?.[1] || 'snack-assortment';
}

export function tinctureIngredient(name: string): string | undefined {
  const match: [RegExp, string][] = [
    [/слив/i, 'plum'],
    [/вишн/i, 'cherry'],
    [/абрикос/i, 'apricot'],
    [/персик/i, 'peach'],
    [/клубник/i, 'strawberry'],
    [/малин/i, 'raspberry'],
    [/киви/i, 'kiwi'],
    [/мандарин/i, 'mandarin'],
    [/ирис|карамел/i, 'caramel'],
    [/барбарис/i, 'barberry'],
    [/конфет/i, 'candy'],
    [/имбир/i, 'ginger'],
    [/перец|перцов/i, 'pepper'],
  ];
  return match.find(([pattern]) => pattern.test(name))?.[1];
}

export function shotPhoto(name: string): string {
  const n = name.toLowerCase();
  if (/pink|вишн|клубник|малин|барбарис|перец/.test(n)) return 'shot-pink';
  if (/mint|киви/.test(n)) return 'shot-mint';
  if (/peach|персик|абрикос|мандарин|имбир/.test(n)) return 'shot-peach';
  if (/photo|street|bobr/.test(n)) return 'shot-clear';
  if (/barbar|ирис|конфет/.test(n)) return 'shot-layered';
  return 'shot';
}
