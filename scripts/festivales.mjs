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

// ---------- Festivales nuevos ----------
// Cada día se buscan eventos con «fest» o «festival» en el nombre en Monterrey y su zona (Ticketmaster y Superboletos).
// Los que no están en el catálogo se guardan en «_descubiertos» y la página los muestra en la pestaña Festivales.
const ES_FEST = /\bfest\b|festival|\w+fest\b|\bfest\w*\b/i;
const RUIDO = /\b(20\d\d|d[ií]a \d|day \d|abono|pase|vip|general|preferente|boleto|acceso|early|preventa|fase \d)\b|[-–|:]\s*$/gi;
const baseNombre = t => norm(String(t)).replace(RUIDO, ' ').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const delCatalogo = t => festivales.some(f => { try { return f.claves && new RegExp(f.claves, 'i').test(t); } catch { return false; } });
function tipoDe(t) {
  const x = norm(t);
  if (/taco|trompo|comida|food|gastro|machaca|carne|bbq|asado|pizza|hamburgues|cafe|postre|chocolate|pan\b|cabrito/.test(x)) return 'gastro';
  if (/cerveza|beer|vino|wine|mezcal|tequila|cocktail|coctel|whisk/.test(x)) return 'bebidas';
  if (/techno|house|edm|electr|rave|trance/.test(x)) return 'electronica';
  if (/cine|film|pelicula|corto/.test(x)) return 'cine';
  if (/anime|comic|geek|cosplay|gamer|videojuego|k-?pop/.test(x)) return 'cultura-pop';
  if (/nino|infantil|familia|kids/.test(x)) return 'familia';
  if (/arte|cultura|danza|teatro|libro|letras|poesia/.test(x)) return 'cultura';
  return 'musica';
}
const encontrados = new Map();
const sumar = x => {   // junta las funciones o días de un mismo festival
  if (!ES_FEST.test(x.nombre) || delCatalogo(x.nombre)) return;
  const k = baseNombre(x.nombre); if (!k) return;
  const p = encontrados.get(k);
  if (!p) encontrados.set(k, { ...x });
  else { if (x.inicio < p.inicio) { p.inicio = x.inicio; p.url = x.url; } if ((x.fin || x.inicio) > (p.fin || p.inicio)) p.fin = x.fin || x.inicio; if (!p.img && x.img) p.img = x.img; }
};
const hastaUnAnio = new Date(hoy.getTime() + 365 * 864e5).toISOString().slice(0, 19) + 'Z';
if (llave) for (const kw of ['festival', 'fest']) for (let pg = 0; pg < 3; pg++) {
  let d = null; try { d = JSON.parse(await traer(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${llave}&countryCode=MX&latlong=25.6866,-100.3161&radius=60&unit=km&keyword=${kw}&size=100&page=${pg}&sort=date,asc&startDateTime=${iso(hoy)}T00:00:00Z&endDateTime=${hastaUnAnio}`) || 'null'); } catch {}
  const evs = d?._embedded?.events || []; if (!evs.length) break;
  for (const e of evs) {
    const v = e._embedded?.venues?.[0] || {}, f0 = e.dates?.start?.localDate; if (!f0) continue;
    const img = (e.images || []).filter(x => x.ratio === '16_9').sort((a, b) => b.width - a.width)[0];
    sumar({ nombre: e.name, inicio: f0, fin: e.dates?.end?.localDate || f0, lugar: [v.name, v.city?.name].filter(Boolean).join(', '), url: e.url, img: img?.url || null, fuente: 'Ticketmaster' });
  }
  await new Promise(r => setTimeout(r, 300));
}
try {
  const sb = JSON.parse(await traer('https://dl09mj2qf37fz.cloudfront.net/SuperBoletosRepositorio/apps/jsonCache/27768/catalogos/search.json') || '[]');
  const fecha = t => { const m = String(t || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  for (const e of sb) {
    if (!/nuevo le/i.test(e.nombreEstado || '')) continue;
    const ini = fecha(e.fechaPrimeraPresentacion); if (!ini || ini < iso(hoy)) continue;
    sumar({ nombre: String(e.nombreEvento || '').replace(/&amp;/g, '&'), inicio: ini, fin: fecha(e.fechaUltimaPresentacion) || ini, lugar: [e.nombreRecinto, e.nombreCiudad].filter(Boolean).join(', '),
      url: `https://www.superboletos.com/landing-evento/${e.eventoId}`, img: e.rutaImagenMain || null, fuente: 'Superboletos' });
  }
} catch {}
// Se conservan los que ya se habían encontrado y todavía no pasan
const previos = (antes._descubiertos || []).filter(x => (x.fin || x.inicio) >= iso(hoy));
const lista = new Map(previos.map(x => [baseNombre(x.nombre), x]));
for (const [k, x] of encontrados) {
  const nombre = String(x.nombre).replace(/\s*[-–|]\s*(20\d\d|d[ií]a \d.*)$/i, '').trim();
  if (!lista.has(k)) console.log(`::notice::Festival nuevo encontrado: ${nombre} (${x.inicio}, ${x.fuente})`);
  lista.set(k, { id: 'auto-' + k.replace(/ /g, '-').slice(0, 40), nombre, tipo: tipoDe(x.nombre), lugar: x.lugar, inicio: x.inicio, fin: x.fin || x.inicio, url: x.url, img: x.img, fuente: x.fuente });
}
salida._descubiertos = [...lista.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
console.log(`::notice::Festivales nuevos (fuera del catálogo): ${salida._descubiertos.length}`);
writeFileSync(SAL, JSON.stringify(salida, null, 1) + '\n');
console.log(`::notice::Festivales: ${festivales.length} revisados · ${conFechas} con fechas detectadas · ${cambios} páginas con cambios`);
