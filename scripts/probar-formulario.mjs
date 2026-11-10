// Llena el formulario «Agrega tu evento» en la página publicada, como lo haría una persona,
// y borra al final la solicitud de prueba.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const SB_URL = 'https://aqakoihxgwxdyrtzjrfh.supabase.co', SEC = process.env.SUPABASE_SECRET;
const NOMBRE = 'PRUEBA AUTOMÁTICA FORMULARIO — borrar';
// imagen de prueba de ~2 MB, como una foto de celular
fs.writeFileSync('cartel.jpg', Buffer.concat([Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'), Buffer.alloc(2_000_000)]));
const b = await chromium.launch();
for (const [nombre, ctxOpts] of [['iPhone', devices['iPhone 13']], ['compu', { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await b.newContext(ctxOpts); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && /supabase/.test(r.url())) errs.push(`${r.status()} ${r.url().slice(0, 120)}`); });
  await p.goto('https://mtymovida.com/agregar', { waitUntil: 'networkidle' });
  await p.fill('#sNombre', NOMBRE + ' ' + nombre); await p.fill('#sOrg', 'Prueba'); await p.fill('#sMail', 'prueba@example.com');
  for (const s of ['#sCat', '#sZona']) { const v = await p.$eval(s, el => [...el.options].find(o => o.value)?.value); await p.selectOption(s, v); }
  await p.fill('#sFecha', '2026-12-01'); await p.fill('#sHora', '20:00'); await p.fill('#sDesc', 'Prueba del formulario');
  await p.setInputFiles('#sImg', 'cartel.jpg');
  await p.click('#subForm button[type=submit]');
  await p.waitForTimeout(12000);
  const res = await p.evaluate(() => { const e = document.getElementById('sErr'); return { error: e && !e.hidden ? e.textContent : null, ok: /Recibimos/.test(document.body.innerText) }; });
  console.log(`::notice::${nombre}: ${JSON.stringify(res)}`);
  for (const e of errs.slice(0, 10)) console.log(`::warning::${nombre}: ${e.slice(0, 300)}`);
  await ctx.close();
}
await b.close();
if (SEC) { const h = { apikey: SEC, authorization: `Bearer ${SEC}` };
  const d = await fetch(`${SB_URL}/rest/v1/eventos_enviados?datos->>nombre=like.${encodeURIComponent('PRUEBA AUTOMÁTICA FORMULARIO*')}&select=id,foto`, { method: 'DELETE', headers: { ...h, prefer: 'return=representation' } });
  const filas = await d.json().catch(() => []); console.log(`::notice::Solicitudes de prueba borradas: ${filas.length}`);
  const rutas = filas.map(f => String(f.foto || '').split('/carteles/')[1]).filter(Boolean);
  if (rutas.length) { const s = await fetch(`${SB_URL}/storage/v1/object/carteles`, { method: 'DELETE', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: rutas }) }); console.log(`::notice::Carteles de prueba borrados: ${s.status}`); } }
