// Festivales: cada día revisa si algún festival de public/data/festivales.json ya anunció fechas.
// 1) Busca el festival en Ticketmaster (cuando abre su venta de boletos).
// 2) Lee la página oficial: si publica sus fechas como datos de evento (JSON-LD) las toma,
//    y si su texto cambió desde la última revisión lo anota, para revisarlo a mano.
// El resultado se guarda en public/data/festivales-auto.json, que la página combina con el catálogo.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CAT = 'public/data/festivales.json', SAL = 'public/data/festivales-auto.json';
const AGENTE = 'MtyMovidaBot/1.0 (+agenda cultural de Monterrey)';
const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const iso = d => d.toISOString().slice(0, 10);
const { festivales = [] } = JSON.parse(readFileSync(CAT, 'utf8'));
const antes = existsSync(SAL) ? JSON.parse(readFileSync(SAL, 'utf8')) : {};
const salida = { _revisado: iso(new Date()) };

async function traer(u) {
  try { const r = await fetch(u, { headers: { 'user-agent': AGENTE, 'accept-language': 'es-MX,es;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) }); return r.ok ? await r.text() : null; } catch { return null; }
}
function eventosLD(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const pila = [].concat(j);
    while (pila.length) { const x = pila.pop(); if (!x || typeof x !== 'object') continue; if (Array.isArray(x['@graph'])) pila.push(...x['@graph']); if (/Event/.test([].concat(x['@type'] || []).join(' ')) && x.startDate) out.push(x); }
  }
  return out;
}
const texto = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const llave = process.env.TICKETMASTER_KEY;
let conFechas = 0, cambios = 0;
for (const f of festivales) {
  const prev = antes[f.id] || {}, o = { ...prev };
  delete o.detectado;
  // 1) Ticketmaster
  if (llave && f.buscar) {
    const u = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${llave}&countryCode=MX&keyword=${encodeURIComponent(f.buscar)}&size=50&sort=date,asc&startDateTime=${iso(hoy)}T00:00:00Z`;
    let d = null; try { d = JSON.parse(await traer(u) || 'null'); } catch {}
    const evs = (d?._embedded?.events || []).filter(e => {
      const v = e._embedded?.venues?.[0] || {};
      return /nuevo le/i.test(v.state?.name || '') || /monterrey|san pedro|guadalupe|san nicol|apodaca|escobedo|santa catarina/i.test(v.city?.name || '');
    }).filter(e => norm(e.name).includes(norm(f.buscar)));
    const fechas = evs.map(e => e.dates?.start?.localDate).filter(Boolean).sort();
    if (fechas.length) o.detectado = { inicio: fechas[0], fin: fechas.at(-1), url: evs[0].url, fuente: 'Ticketmaster' };
    await new Promise(r => setTimeout(r, 300));
  }
  // 2) Página oficial
  if (f.sitio && !/instagram|facebook/.test(f.sitio)) {
    const h = await traer(f.sitio);
    if (h) {
      if (!o.detectado) {
        const evs = eventosLD(h).map(e => ({ i: String(e.startDate).slice(0, 10), f: String(e.endDate || e.startDate).slice(0, 10) })).filter(e => e.f >= iso(hoy)).sort((a, b) => a.i.localeCompare(b.i));
        if (evs.length) o.detectado = { inicio: evs[0].i, fin: evs.map(e => e.f).sort().at(-1), url: f.sitio, fuente: 'Página oficial' };
      }
      const firma = createHash('sha1').update(texto(h)).digest('hex').slice(0, 12);
      if (prev.firma && prev.firma !== firma) { o.cambio = iso(new Date()); cambios++; console.log(`::notice::${f.nombre}: su página oficial cambió, conviene revisarla (${f.sitio})`); }
      o.firma = firma;
      const anio = String(hoy.getFullYear() + 1);
      o.menciona = texto(h).includes(anio) ? anio : null;   // la página ya habla del año siguiente
    }
  }
  if (o.detectado) { conFechas++; if (!prev.detectado || prev.detectado.inicio !== o.detectado.inicio) console.log(`::notice::${f.nombre}: fechas detectadas ${o.detectado.inicio} a ${o.detectado.fin} (${o.detectado.fuente})`); }
  salida[f.id] = o;
}
writeFileSync(SAL, JSON.stringify(salida, null, 1) + '\n');
console.log(`::notice::Festivales: ${festivales.length} revisados · ${conFechas} con fechas detectadas · ${cambios} páginas con cambios`);
