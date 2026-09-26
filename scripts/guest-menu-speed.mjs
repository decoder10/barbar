// Speed of the public guest menu on a phone, measured locally. Nothing leaves this computer: the menu
// comes from the bootstrap catalog in memory, the page and assets from a built `dist`
// (`scripts/guest-menu-stand.mjs`), the browser is the local Chrome.
//
//   npm run build && npm run speed:menu -- [--root <checkout>] [--runs 5] [--locale ru-RU] [--out file.json]
//
// `--root` measures another checkout (for example the previous revision, built there), so the numbers
// before and after a change come from identical conditions. `--locale` is the browser language
// (default en-US); it picks the menu language and so the translations the page embeds.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startGuestMenuStand } from './guest-menu-stand.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const runs = Number(argument('runs', '5'));
const out = argument('out');
const locale = argument('locale', 'en-US');
// Lighthouse "slow 4G" mobile profile: 150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up, CPU four times slower.
const profile = { latency: 150, download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, cpu: 4 };

const stand = await startGuestMenuStand({ root: argument('root'), dist: argument('dist', 'dist') });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const observe = () => {
    const state = { cls: 0, lcp: 0, fcp: 0, priceAt: 0, interactive: 0 };
    window.__speed = state;
    // Interactive: React has attached its handlers to the menu search (after hydration or a client render).
    const ready = setInterval(() => {
      const search = document.querySelector('.menu-search input');
      if (search && Object.keys(search).some((key) => key.startsWith('__reactProps'))) {
        state.interactive = performance.now();
        clearInterval(ready);
      }
    }, 10);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = entry.renderTime || entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.name === 'first-contentful-paint') state.fcp = entry.startTime;
    }).observe({ type: 'paint', buffered: true });
    // Cumulative layout shift: the largest session window (gaps under 1 s, at most 5 s long).
    let current = { value: 0, start: 0, last: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        if (entry.startTime - current.last > 1000 || entry.startTime - current.start > 5000)
          current = { value: 0, start: entry.startTime, last: entry.startTime };
        current.value += entry.value;
        current.last = entry.startTime;
        state.cls = Math.max(state.cls, current.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    // The first card with a price, whether the HTML parser or the script inserted it.
    const check = () => {
      if (!state.priceAt && document.querySelector('.menu-card b')) state.priceAt = performance.now();
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', check);
  };
  const measure = async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.download,
      uploadThroughput: profile.upload,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await page.addInitScript(observe);
    await page.goto(`${stand.origin}/menu`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForSelector('.menu-card', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const state = window.__speed;
      const navigation = performance.getEntriesByType('navigation')[0];
      const bytes = { html: navigation.transferSize, js: 0, css: 0, font: 0, menuApi: 0, image: 0, other: 0 };
      const counts = { js: 0, font: 0, image: 0 };
      let fontsDone = 0;
      for (const entry of performance.getEntriesByType('resource')) {
        if (/\.woff2?$/.test(entry.name)) fontsDone = Math.max(fontsDone, entry.responseEnd);
        const path = new URL(entry.name).pathname;
        const kind = /\.js$/.test(path)
          ? 'js'
          : /\.css$/.test(path)
            ? 'css'
            : /\.woff2?$/.test(path)
              ? 'font'
              : path === '/api/menu'
                ? 'menuApi'
                : /\.(webp|avif|png|jpe?g|svg)$/.test(path)
                  ? 'image'
                  : 'other';
        bytes[kind] += entry.transferSize;
        if (kind in counts) counts[kind]++;
      }
      return {
        fcp: state.fcp,
        lcp: state.lcp,
        cls: state.cls,
        firstPrice: state.priceAt ? Math.max(state.priceAt, state.fcp) : null,
        fontsLoaded: fontsDone,
        interactive: state.interactive || null,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        load: navigation.loadEventEnd,
        bytes,
        counts,
      };
    });
    await context.close();
    return { ...result, errors };
  };
  const withoutScript = async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`${stand.origin}/menu`, { waitUntil: 'load' });
    const result = await page.evaluate(() => ({
      cards: document.querySelectorAll('.menu-card').length,
      prices: (document.body.innerText.match(/\d[\d\s,.]*\s*֏/g) || []).length,
    }));
    await context.close();
    return result;
  };
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await measure());
  const median = (values) => {
    const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const pick = (read) => median(samples.map(read));
  const round = (value, digits = 0) => (value === null ? null : Number(value.toFixed(digits)));
  const report = {
    root: argument('root', process.cwd()),
    serverRendering: stand.serverRendering,
    profile: { viewport: '390x844', ...profile, download: '1.6 Mbit/s', upload: '750 kbit/s', runs, locale },
    medianMs: {
      fcp: round(pick((s) => s.fcp)),
      lcp: round(pick((s) => s.lcp)),
      firstPrice: round(pick((s) => s.firstPrice)),
      fontsLoaded: round(pick((s) => s.fontsLoaded)),
      interactive: round(pick((s) => s.interactive)),
      domContentLoaded: round(pick((s) => s.domContentLoaded)),
      load: round(pick((s) => s.load)),
    },
    cls: round(
      pick((s) => s.cls),
      3,
    ),
    transferKb: Object.fromEntries(
      Object.keys(samples[0].bytes).map((key) => [key, round(pick((s) => s.bytes[key]) / 1024, 1)]),
    ),
    requests: samples[0].counts,
    withoutJavaScript: await withoutScript(),
    consoleErrors: [...new Set(samples.flatMap((s) => s.errors))],
  };
  console.log(JSON.stringify(report, null, 2));
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser.close();
  await stand.close();
}
