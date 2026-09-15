import { describe, expect, it } from 'vitest';
import en from '../../presentation/i18n/en.json' with { type: 'json' };
import hy from '../../presentation/i18n/hy.json' with { type: 'json' };
import { barConfig, configHash, keywordMatcher, validateConfig } from '..';

const ledgerCategories = [
  'cocktail',
  'tincture',
  'shot',
  'set',
  'beer',
  'wine',
  'cognac',
  'hot',
  'soft',
  'snack',
];

describe('bar configuration', () => {
  it('is valid and covers every menu category the ledger supports', () => {
    expect(validateConfig(barConfig, ledgerCategories)).toEqual([]);
  });
  it('reports broken configs instead of failing at runtime', () => {
    const broken = structuredClone(barConfig);
    broken.groups.matchOrder.push('unknown');
    broken.groups.groups[5].keywords.push('re:(');
    broken.menu.categories = broken.menu.categories.filter((c) => c.id !== 'snack');
    broken.guest.copy.service.hy = '';
    broken.presets.storage.warningPercent = 0;
    const problems = validateConfig(broken, ledgerCategories);
    expect(problems).toEqual(
      expect.arrayContaining([
        'matchOrder: unknown group unknown',
        expect.stringContaining('invalid keyword'),
        'menu categories: missing snack',
        'guest copy service: needs ru, en and hy',
        expect.stringContaining('storage'),
      ]),
    );
  });
  it('has translations for every label, hint and category name', () => {
    const missing = [
      ...barConfig.groups.groups.flatMap((g) => [g.label, g.hint]),
      ...barConfig.menu.categories.map((c) => c.label),
    ]
      .filter((text): text is string => !!text)
      .filter((text) => !(text in en) || !(text in hy));
    expect(missing).toEqual([]);
  });
  it('matches plain and regular-expression keywords and hashes sections stably', () => {
    expect(keywordMatcher('сок')('томатный сок')).toBe(true);
    expect(keywordMatcher('re:\\btea\\b')('steak')).toBe(false);
    expect(configHash(barConfig.upgrades)).toBe(configHash(structuredClone(barConfig.upgrades)));
    expect(configHash({ a: 1 })).not.toBe(configHash({ a: 2 }));
  });
});
