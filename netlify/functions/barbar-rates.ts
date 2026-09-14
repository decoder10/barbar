export { handleRates as default } from '../lib/barbar-rates';
export const config = {
  path: '/api/barbar/rates',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
