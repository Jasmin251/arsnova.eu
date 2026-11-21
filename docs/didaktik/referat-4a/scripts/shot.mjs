// Screenshot des Host-Moderationskompasses (Host-Anzeige) für Auftrag 4A.
// Nutzung: node shot.mjs <stateFile> <outPrefix> [summarize]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../../package.json', import.meta.url));
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = await import('playwright'));
}

const [stateFile, out, summarize] = process.argv.slice(2);
const s = JSON.parse(readFileSync(stateFile, 'utf8'));
const BASE = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4200';

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  locale: 'de-DE',
});
await page.addInitScript(
  ([code, token]) => {
    sessionStorage.setItem(`arsnova-host-token:${code}`, token);
    sessionStorage.setItem(`arsnova-host-role:${code}`, 'ORIGINAL_HOST');
  },
  [s.code, s.hostToken],
);
await page.goto(`${BASE}/session/${s.code}/host`, { waitUntil: 'networkidle', timeout: 120000 });
const btn = page.locator('[data-testid="host-moderation-compass"]');
await btn.waitFor({ timeout: 60000 });
await page.screenshot({ path: `${out}-host.png` });
await btn.evaluate((el) => el.click());
const dialog = page.getByRole('dialog');
await dialog.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-kompass.png` });
if (summarize) {
  const t0 = Date.now();
  const sb = page.locator('.moderation-compass-dialog__summary-button');
  await sb.waitFor({ timeout: 30000 });
  console.log(JSON.stringify({ summaryButtonDisabled: await sb.isDisabled() }));
  await sb.evaluate((el) => el.click());
  const summary = page.locator('[data-testid="moderation-summary"]');
  const statusText = async () => await summary.innerText().catch(() => '');
  let sawPending = false;
  const trace = [];
  for (let i = 0; i < 300; i++) {
    const t = await statusText();
    const pending = /wird erstellt/i.test(t);
    if (pending) sawPending = true;
    if (i % 10 === 0) trace.push({ s: Math.round((Date.now() - t0) / 1000), pending });
    if (sawPending && !pending) break;
    await page.waitForTimeout(500);
  }
  console.log(JSON.stringify({ sawPending, trace }));
  await page.waitForTimeout(1000);
  console.log(
    JSON.stringify({
      summaryVisibleAfterMs: Date.now() - t0,
      text: (await summary.innerText()).slice(0, 1500),
    }),
  );
  await summary.scrollIntoViewIfNeeded();
  await summary.screenshot({ path: `${out}-summary.png` });
  await page.screenshot({ path: `${out}-kompass-mit-summary.png`, fullPage: false });
}

await browser.close();
