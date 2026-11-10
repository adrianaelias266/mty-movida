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
  if (nombre === 'compu') { const h = await p.evaluate(() => typeof topWeek === 'function' ? topWeek().map(e => e.cat + ': ' + e.t).join(' | ') : '').catch(() => ''); console.log(`::notice::Carrusel: ${h}`); const cats = await p.evaluate(() => EVENTS.filter(e => e.off >= 0 && e.off <= 13 && /tochito|yoga|softball|capoeira|trofeo|jamaica|cumbia fit/i.test(e.t)).map(e => e.cat + ': ' + e.t).join(' | ')).catch(() => ''); console.log(`::notice::Categorías: ${cats}`); const f = await p.evaluate(() => [...document.querySelectorAll('.rowsec')].map(s => s.querySelector('h3').textContent + ': ' + [...s.querySelectorAll('.rc b')].slice(0, 5).map(b => b.textContent).join(', ')).join(' || ')).catch(() => ''); console.log(`::notice::Filas: ${f}`); }
  for (const e of errs.slice(0, 15)) console.log(`::warning::${nombre} error: ${e.slice(0, 300)}`);
  for (const f of fallas.slice(0, 20)) console.log(`::warning::${nombre} petición: ${f}`);
  for (const v of ['eventos', 'festivales', 'atracciones', 'plan', 'calendario', 'agregar', 'nosotros', 'e/tw01']) {
    const antes = errs.length;
    try { await p.goto(new URL('/' + v, URL0).href, { waitUntil: 'networkidle', timeout: 30000 }); await p.waitForTimeout(1500); } catch (e) { errs.push(v + ' carga: ' + e.message); }
    const txt = await p.evaluate(() => (document.querySelector('main') || document.body).innerText.length).catch(() => -1);
    console.log(`::notice::${nombre} /${v}: texto ${txt} · errores nuevos ${errs.length - antes}`);
  }
  try { await p.goto(URL0, { waitUntil: 'networkidle' }); const a = await p.$('a[href^="/e/"], [data-ev], .ev'); if (a) { await a.click(); await p.waitForTimeout(1500); console.log(`::notice::${nombre} clic en evento → ${p.url()}`); } } catch (e) { errs.push('clic: ' + e.message); }
  for (const e of errs.slice(0, 15)) console.log(`::warning::${nombre} error2: ${e.slice(0, 300)}`);
  await p.screenshot({ path: `revision-${nombre}.png`, fullPage: false });
  await p.close();
}
await b.close();
