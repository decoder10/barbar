// Anonymous, read-only latency probe: GET /api/menu and the unauthenticated session check.
// Usage: node scripts/latency-probe.mjs https://barbar-cafe.netlify.app [requests=15]
const [base = 'https://barbar-cafe.netlify.app', countArg = '15'] = process.argv.slice(2);
const count = Math.min(60, Math.max(3, Number(countArg) || 15));
const routes = ['/api/menu', '/api/barbar/auth'];
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const report = {};
for (const route of routes) {
  const times = [];
  const server = [];
  const statuses = new Set();
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    const response = await fetch(new URL(route, base), { headers: { 'Cache-Control': 'no-cache' } });
    await response.arrayBuffer();
    times.push(performance.now() - started);
    statuses.add(response.status);
    const timing = response.headers.get('server-timing') || '';
    const total = timing.match(/total;dur=([\d.]+)/) || timing.match(/data;dur=([\d.]+)/);
    if (total) server.push(Number(total[1]));
  }
  report[route] = {
    statuses: [...statuses],
    firstMs: Math.round(times[0]),
    p50Ms: Math.round(percentile(times, 50)),
    p95Ms: Math.round(percentile(times, 95)),
    maxMs: Math.round(Math.max(...times)),
    serverP50Ms: server.length ? Math.round(percentile(server, 50)) : null,
  };
}
console.log(JSON.stringify({ base, requests: count, at: new Date().toISOString(), report }, null, 2));
