import { expect, test } from 'vitest';
import { parseRates } from './barbar-rates';
test('normalizes rates quoted for multiple units and rejects incomplete responses', () => {
  const xml =
    '<CurrentDate>2026-09-11T00:00:00</CurrentDate>' +
    [
      ['USD', 1, 363.28],
      ['EUR', 1, 421.11],
      ['RUB', 100, 429.71],
    ]
      .map(
        ([iso, amount, rate]) =>
          `<ExchangeRate><ISO>${iso}</ISO><Amount>${amount}</Amount><Rate>${rate}</Rate></ExchangeRate>`,
      )
      .join('');
  expect(parseRates(xml)).toMatchObject({
    date: '2026-09-11',
    amdPerUnit: { AMD: 1, USD: 363.28, EUR: 421.11 },
  });
  expect(parseRates(xml).amdPerUnit.RUB).toBeCloseTo(4.2971, 10);
  expect(() => parseRates(xml.replace('<Rate>421.11</Rate>', '<Rate>0</Rate>'))).toThrow();
  expect(() => parseRates('<html>Error</html>')).toThrow();
});
