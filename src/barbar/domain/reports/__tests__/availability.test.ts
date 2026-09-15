import { describe, expect, it } from 'vitest';
import { availabilityDays } from '../availability';

describe('stock availability for demand forecast', () => {
  it('excludes closed days and days that started without stock', () => {
    // Sep 1–5 worked, Sep 6 closed. Gin: 100 at start, sold out on Sep 2, restocked on Sep 4.
    const result = availabilityDays({
      from: '2026-09-01',
      to: '2026-09-06',
      current: new Map([['gin', 850]]),
      workedDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-08-30'],
      changes: [
        { date: '2026-09-01', alcoholId: 'gin', delta: -50, consumed: 50 },
        { date: '2026-09-02', alcoholId: 'gin', delta: -50, consumed: 50 },
        { date: '2026-09-04', alcoholId: 'gin', delta: 1000, consumed: 0 },
        { date: '2026-09-05', alcoholId: 'gin', delta: -150, consumed: 150 },
      ],
    });
    // Sep 3 starts at 0 with no use: the only stock-out day. Sep 4 starts at 0 but is restocked.
    expect(result.get('gin')).toEqual({ workedDays: 5, availableDays: 3, stockoutDays: 2 });
  });

  it('counts an item without movements as available only while it has stock', () => {
    const result = availabilityDays({
      from: '2026-09-01',
      to: '2026-09-02',
      current: new Map([
        ['tonic', 300],
        ['empty', 0],
      ]),
      workedDates: ['2026-09-01', '2026-09-02'],
      changes: [],
    });
    expect(result.get('tonic')).toMatchObject({ availableDays: 2, stockoutDays: 0 });
    expect(result.get('empty')).toMatchObject({ availableDays: 0, stockoutDays: 2 });
  });
});
