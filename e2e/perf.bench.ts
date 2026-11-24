import { writeFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

/**
 * Fotogramas por segundo del mapa en Chrome sin GPU: 24 participantes (8 caídos) caminando, noche, niebla y
 * bocadillos. Mide 5 s tras 3 s de calentamiento (bloques del terreno y fotogramas de las figuras ya hechos),
 * con la CPU normal y frenada ×4, en escritorio y en móvil. Después apaga cada parte para ver lo que cuesta.
 */
const BASE = 'http://127.0.0.1:4400/bench/mapa.html?n=24&caidos=8&noche&niebla&bocadillos';
const PARTS = ['terreno', 'figuras', 'noche', 'niebla', 'rotulos', 'bocadillos'];
const results: Record<string, unknown> = {};

async function measure(page: Page, off: string[] = [], ms = 5000) {
  return page.evaluate(
    ({ off, ms }) =>
      new Promise<{ fps: number; p95: number; parts: Record<string, number> }>((done) => {
        const probe = { frames: 0, ms: {} as Record<string, number>, off: Object.fromEntries(off.map((k) => [k, true])) };
        (window as unknown as { __cenizaPerf: typeof probe }).__cenizaPerf = probe;
        const gaps: number[] = [];
        let last = performance.now();
        const start = last;
        const step = (t: number) => {
          gaps.push(t - last);
          last = t;
          if (t - start < ms) requestAnimationFrame(step);
          else {
            gaps.sort((a, b) => a - b);
            const parts = Object.fromEntries(Object.entries(probe.ms).map(([k, v]) => [k, +(v / Math.max(1, probe.frames)).toFixed(2)]));
            done({ fps: +((gaps.length * 1000) / (t - start)).toFixed(1), p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1), parts });
          }
        };
        requestAnimationFrame(step);
      }),
    { off, ms },
  );
}

for (const device of [
  { name: 'escritorio', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false },
  { name: 'movil', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true },
]) {
  test(`mapa a 60 fps: ${device.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor, isMobile: device.isMobile, hasTouch: device.isMobile });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.locator('.map-canvas').waitFor();
    await page.waitForTimeout(3000);
    const cdp = await ctx.newCDPSession(page);
    const out: Record<string, unknown> = {};
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      // Con la CPU frenada el mapa baja su densidad y rehace bloques y figuras: se mide ya asentado.
      await page.waitForTimeout(rate === 1 ? 1000 : 9000);
      out[`cpu×${rate}`] = await measure(page);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const part of PARTS) out[`cpu×4 sin ${part}`] = (await measure(page, [part], 3000)).fps;
    await page.screenshot({ path: `e2e/.artifacts/perf-${device.name}.png` });
    results[device.name] = out;
    console.log(device.name, JSON.stringify(out));
    await ctx.close();
  });
}

test.afterAll(() => writeFileSync('e2e/.artifacts/perf.json', JSON.stringify(results, null, 2)));
