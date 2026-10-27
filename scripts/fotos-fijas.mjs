// Fotos libres para los eventos que vienen escritos dentro de la página (FISL, CONARTE, Arena, etc.) y no traen foto.
// Abre la página con un navegador, toma la lista de eventos sin foto y guarda en public/data/fotos-fijas.json
// la foto y el crédito que encuentre. Lo ya buscado no se vuelve a buscar.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { buscarFoto } from './fotos.mjs';

const ARCHIVO = 'public/data/fotos-fijas.json';
const REGLAS = 2;   // si cambian las reglas de búsqueda, se sube este número y se vuelve a buscar todo
const guardado = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : {};
const previo = guardado._reglas === REGLAS ? guardado : {};
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer((q, r) => { const f = join('public', decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': tipos[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); }).listen(8099);
const nav = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); const p = await nav.newPage();
await p.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
const lista = await p.evaluate(() => EVENTS.filter(e => (!e.img || e.credit) && !String(e.id).startsWith('db-')).map(e => ({ id: e.id, t: e.t, cat: e.cat, venue: e.venue })));
const atracciones = await p.evaluate(() => ATR.filter(a => !ATR_FOTO[a.id]).map(a => ({ id: 'atr:' + a.id, n: a.n })));
await nav.close(); srv.close();
const salida = { _reglas: REGLAS }; let nuevas = 0;
for (const e of lista) {
  if (e.id in previo) { salida[e.id] = previo[e.id]; continue; }
  const artista = e.t.split(/\s[-–|@]\s|:|\(/)[0];
  let r = ['concierto', 'musica', 'teatro', 'danza'].includes(e.cat) ? await buscarFoto(artista, 'artista') : null;
  if (!r && e.venue) r = await buscarFoto(e.venue.split(',')[0], 'lugar');
  salida[e.id] = r; if (r) nuevas++;
}
for (const a of atracciones) {
  if (a.id in previo) { salida[a.id] = previo[a.id]; continue; }
  const nombre = a.n.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const r = await buscarFoto(nombre, 'lugar'); salida[a.id] = r; if (r) nuevas++;
}
writeFileSync(ARCHIVO, JSON.stringify(salida, null, 1));
console.log(`::notice::Eventos fijos sin foto: ${lista.length} · fotos nuevas: ${nuevas} · con foto en total: ${Object.entries(salida).filter(([k, v]) => k !== '_reglas' && v).length}`);
