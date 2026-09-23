import { describe, expect, it } from 'vitest';
import { feedLines, feedSummary, type FeedItem } from '../feed';
import { guestMessage, guestTitle } from '../message';

const base = {
  id: 'guest:1',
  createdAt: '2026-09-23T08:00:00.000Z',
  delivered: true,
  kind: 'guest' as const,
};
describe('guest request notifications', () => {
  const item: FeedItem = {
    ...base,
    tableName: '3',
    lines: [
      { name: 'Mojito', quantity: 2 },
      { name: 'Vodka', quantity: 1, servingMl: 50 },
      { name: 'Chips', quantity: 1 },
    ],
    total: 4500,
    comment: 'Terrace',
  };
  it('lead with the table and list what was asked for in every language', () => {
    expect(guestTitle('3')).toBe('Стол 3 · Заявка гостя');
    expect(guestTitle('3', 'en')).toBe('Table 3 · Guest request');
    expect(guestTitle('3', 'hy')).toBe('Սեղան 3 · Հյուրի հայտ');
    expect(feedLines(item)).toEqual(['Mojito × 2', 'Vodka × 1 · 50 мл', 'Chips × 1']);
    expect(feedLines(item, 'en')[1]).toBe('Vodka × 1 · 50 ml');
    expect(feedLines(item, 'hy')[1]).toBe('Vodka × 1 · 50 մլ');
    expect(feedSummary(item)).toBe('Mojito × 2, Vodka × 1 · 50 мл · +1');
    expect(guestMessage(item, 'en')).toBe('Mojito × 2, Vodka × 1 · 50 ml, Chips × 1 · 4,500 ֏');
  });
  it('keeps legacy events table-first without inventing lines or repeating the heading', () => {
    const legacy: FeedItem = { ...base, tableName: '12' };
    for (const language of ['ru', 'en', 'hy']) {
      expect(feedLines(legacy, language)).toEqual([]);
      expect(feedSummary(legacy, language)).toBe('');
    }
    expect(guestMessage(legacy)).toBe('Стол 12');
  });
});
