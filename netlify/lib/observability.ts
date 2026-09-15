// One flag per Functions instance: the first request after a cold start is marked.
let warm = false;

/** Structured latency line for Netlify function logs. No query strings, bodies or user identifiers. */
export function observe(route: string, request: Request, response: Response, started: number) {
  const cold = !warm;
  warm = true;
  const duration = performance.now() - started;
  response.headers.append('Server-Timing', `total;dur=${duration.toFixed(1)}`);
  console.info(
    JSON.stringify({
      metric: 'barbar.api',
      route,
      method: request.method,
      status: response.status,
      ms: Math.round(duration),
      cold,
    }),
  );
  return response;
}
