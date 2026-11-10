// Revisa la página publicada en un navegador real: errores, peticiones fallidas y cuántos eventos carga.
import { chromium } from 'playwright';
const URL0 = process.env.URL || 'https://mtymovida.com/';
const b = await chromium.launch();
for (const [nombre, vp] of [['celular', { width: 390, height: 844 }], ['compu', { width: 1366, height: 900 }]]) {
  const p = await b.newPage({ viewport: vp });
  const errs = [], fallas = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('consola: ' + m.text()); });
  p.on('requestfailed', r => fallas.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
  p.on('response', r => { if (r.status() >= 400) fallas.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  const t0 = Date.now();
  try { await p.goto(URL0, { waitUntil: 'networkidle', timeout: 45000 }); } catch (e) { errs.push('carga: ' + e.message); }
  await p.waitForTimeout(3000);
  const info = await p.evaluate(() => ({ eventos: typeof EVENTS !== 'undefined' ? EVENTS.length : -1, db: typeof EVENTS !== 'undefined' ? EVENTS.filter(e => String(e.id).startsWith('db-')).length : -1, texto: document.body.innerText.slice(0, 160).replace(/\s+/g, ' ') })).catch(e => ({ error: e.message }));
  console.log(`::notice::${nombre}: ${Date.now() - t0} ms · ${JSON.stringify(info)}`);
  for (const e of errs.slice(0, 15)) console.log(`::warning::${nombre} error: ${e.slice(0, 300)}`);
  for (const f of fallas.slice(0, 20)) console.log(`::warning::${nombre} petición: ${f}`);
  await p.screenshot({ path: `revision-${nombre}.png`, fullPage: false });
  await p.close();
}
await b.close();
