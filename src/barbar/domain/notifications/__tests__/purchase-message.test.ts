import { describe, expect, it } from 'vitest';
import { alertMessage, purchaseMessage } from '../message';

const notice = {
  purchaseId: 'p1',
  name: 'Хлеб',
  quantity: 12,
  unit: 'pcs',
  amount: 2400,
  date: '2026-09-15',
  createdAt: '2026-09-15T10:05:00.000Z',
};
describe('owner notification text', () => {
  it('shows item, quantity, saved amount and Yerevan time', () => {
    expect(purchaseMessage(notice)).toMatch(/^Хлеб · 12 шт\. · 2\s400 ֏ · 14:05$/);
    expect(purchaseMessage(notice, 'en')).toBe('Хлеб · 12 pcs · 2,400 ֏ · 02:05 PM');
  });
  it('mentions a back-dated purchase date', () => {
    expect(purchaseMessage({ ...notice, date: '2026-09-13' })).toContain('дата закупки 2026-09-13');
  });
  it('keeps stock alert wording', () => {
    expect(
      alertMessage({ id: 'gin', name: 'Gin', unit: 'ml', quantity: 150, threshold: 150, severity: 'low' }),
    ).toBe('Заканчивается: Gin · 150 мл');
  });
});
