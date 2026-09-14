import type { ExchangeRates } from '../../src/barbar/domain/identity/preferences';
import { json } from './barbar-auth';
let cached: ExchangeRates | undefined;
let pending: Promise<ExchangeRates> | undefined;
const endpoint = 'https://api.cba.am/exchangerates.asmx';
export function parseRates(xml: string): ExchangeRates {
  const date = xml.match(/<CurrentDate>([^<]+)/)?.[1]?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Missing rate date');
  const amdPerUnit: ExchangeRates['amdPerUnit'] = { AMD: 1, RUB: 0, USD: 0, EUR: 0 };
  for (const row of xml.matchAll(/<ExchangeRate>([\s\S]*?)<\/ExchangeRate>/g)) {
    const iso = row[1].match(/<ISO>([^<]+)/)?.[1];
    if (iso === 'RUB' || iso === 'USD' || iso === 'EUR') {
      const amount = Number(row[1].match(/<Amount>([^<]+)/)?.[1]);
      const rate = Number(row[1].match(/<Rate>([^<]+)/)?.[1]);
      if (Number.isFinite(rate) && Number.isFinite(amount) && rate > 0 && amount > 0)
        amdPerUnit[iso] = rate / amount;
    }
  }
  if (Object.values(amdPerUnit).some((n) => n <= 0)) throw new Error('Incomplete rates');
  return { date, fetchedAt: new Date().toISOString(), amdPerUnit };
}
export async function latestRates(): Promise<ExchangeRates> {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 3600000) return cached;
  pending ||= (async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://www.cba.am/ExchangeRatesLatest"',
      },
      body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ExchangeRatesLatest xmlns="http://www.cba.am/" /></soap:Body></soap:Envelope>',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Rates unavailable');
    const xml = await response.text();
    if (xml.length > 100000) throw new Error('Unexpected response size');
    cached = parseRates(xml);
    return cached;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export async function handleRates(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  try {
    return json(await latestRates(), 200, {
      'Cache-Control': 'public, max-age=3600',
      'Netlify-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600',
    });
  } catch {
    return json({ error: 'Курс ЦБ Армении временно недоступен. Суммы показаны в AMD.' }, 503);
  }
}
