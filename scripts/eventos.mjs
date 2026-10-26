// Recolector de eventos: revisa los sitios de scripts/fuentes.mjs, busca las páginas de
// eventos en su mapa del sitio (sitemap) y lee los datos que publican en formato
// schema.org/Event. Cada evento nuevo entra a Supabase como "pendiente" para revisión.
import { FUENTES as LISTA } from './fuentes.mjs';
const FUENTES = process.env.FUENTES_PRUEBA ? JSON.parse(process.env.FUENTES_PRUEBA).map(f => ({ ...f, filtro: new RegExp(f.filtro) })) : LISTA;

const SB_URL = process.env.SUPABASE_URL || 'https://aqakoihxgwxdyrtzjrfh.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_LfR-ayNY5bpv2xlO8pkEXQ_sE4nP0BG';
const MAX_PAGINAS = 80;          // páginas por fuente en cada corrida
const DIAS_ADELANTE = 90;        // solo eventos de hoy a 90 días
const AGENTE = 'MtyMovidaBot/1.0 (+agenda cultural de Monterrey)';

const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const limite = new Date(hoy.getTime() + DIAS_ADELANTE * 864e5);

async function traer(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': AGENTE, accept: 'text/html,application/xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
const locs = xml => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>(?:[\s\S]*?<lastmod>([^<]+)<\/lastmod>)?/g)].map(m => ({ url: m[1].replace(/&amp;/g, '&'), mod: m[2] }));

async function paginasDe(f) {
  if (f.paginas) return f.paginas;  // páginas que ya traen los eventos (por ejemplo, la agenda de un lugar en Songkick)
  const vistos = new Set(), paginas = [];
  let pendientes = [`${f.sitio}/sitemap_index.xml`, `${f.sitio}/sitemap.xml`, `${f.sitio}/wp-sitemap.xml`];
  for (let nivel = 0; nivel < 3 && pendientes.length; nivel++) {
    const siguientes = [];
    for (const sm of pendientes) {
      if (vistos.has(sm)) continue; vistos.add(sm);
      const xml = await traer(sm); if (!xml) continue;
      for (const { url, mod } of locs(xml)) {
        if (/\.xml(\?|$)/.test(url)) siguientes.push(url);
        else if (f.filtro.test(url) && (!mod || new Date(mod) > new Date(hoy.getTime() - 120 * 864e5))) paginas.push(url);
      }
    }
    pendientes = siguientes;
  }
  return [...new Set(paginas)].slice(-MAX_PAGINAS);
}

function eventosLD(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const pila = Array.isArray(j) ? [...j] : [j];
    while (pila.length) {
      const x = pila.pop(); if (!x || typeof x !== 'object') continue;
      if (Array.isArray(x['@graph'])) pila.push(...x['@graph']);
      const t = [].concat(x['@type'] || []).join(' ');
      if (/Event/.test(t) && x.startDate) out.push(x);
    }
  }
  return out;
}

const limpiar = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8220;|&#8221;/g, '"').replace(/\s+/g, ' ').trim();
function categoria(t) {
  t = t.toLowerCase();
  const reglas = [['charlas', /charla|conferencia|conversatorio|diálogo|panel|club/], ['talleres', /taller|clase|curso|seminario/], ['danza', /danza|ballet|flamenco|baile/],
    ['teatro', /teatro|obra|comedia|títeres|clown/], ['cine', /cine|película|cortometraje|proyección|cineteca/], ['expo', /exposición|muestra|galería|museo|inauguración/],
    ['letras', /lectura|poesía|libro|literatura|cuento/], ['concierto', /concierto|orquesta|sinfónic|banda|tour/], ['musica', /música|musical|canto|coro/],
    ['fiestas', /fiesta|festival de calaveras|noche de/], ['gastro', /mercado|bazar|gastronom|comida/], ['deporte', /carrera|rodada|yoga|senderismo/]];
  return (reglas.find(([, r]) => r.test(t)) || ['expo'])[0];
}
function municipio(t, porDefecto) {
  t = t.toLowerCase();
  const r = [['sanpedro', /san pedro/], ['sannicolas', /san nicol/], ['guadalupe', /guadalupe/], ['apodaca', /apodaca/], ['escobedo', /escobedo/],
    ['santacatarina', /santa catarina/], ['garcia', /garc[ií]a/], ['juarez', /ju[aá]rez/], ['santiago', /santiago/]].find(([, x]) => x.test(t));
  return r ? r[0] : porDefecto;
}
function fechaHora(iso) {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return m ? { fecha: m[1], hora: m[2] || null } : null;
}

async function guardar(filas) {
  if (!filas.length) return 0;
  const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados?on_conflict=fuente_url`, {
    method: 'POST',
    headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}: ${await r.text()}`);
  return filas.length;
}

let total = 0;
for (const f of FUENTES) {
  const paginas = await paginasDe(f);
  const filas = [];
  for (const url of paginas) {
    const html = await traer(url); if (!html) continue;
    for (const e of eventosLD(html)) {
      const ini = fechaHora(e.startDate), fin = fechaHora(e.endDate || e.startDate); if (!ini) continue;
      const dIni = new Date(ini.fecha + 'T00:00'), dFin = new Date(fin.fecha + 'T00:00');
      if (dFin < hoy || dIni > limite) continue;
      const loc = [].concat(e.location || [])[0] || {};
      const lugar = limpiar([loc.name, typeof loc.address === 'string' ? loc.address : loc.address?.streetAddress].filter(Boolean).join(', '));
      const oferta = [].concat(e.offers || [])[0] || {};
      const precio = oferta.price != null && !isNaN(Number(oferta.price)) ? Number(oferta.price) : (/gratis|libre|free/i.test(JSON.stringify(e)) ? 0 : null);
      const nombre = limpiar(e.name), desc = limpiar(e.description).slice(0, 400);
      const enLinea = /Online/.test(String(e.eventAttendanceMode || ''));
      filas.push({
        fuente: f.nombre,
        fuente_url: `${e.url || url}#${e.startDate}`,
        foto: [].concat(e.image || [])[0]?.url || [].concat(e.image || [])[0] || null,
        datos: {
          nombre, organizador: f.nombre, categoria: categoria(nombre + ' ' + desc), municipio: enLinea ? 'linea' : municipio(lugar, f.municipio),
          fecha: ini.fecha, hora: ini.hora, hasta: fin.fecha !== ini.fecha ? fin.fecha : null, lugar, espacio: null, precio,
          caracteristicas: [], descripcion: desc, enlace: e.url || url, fuente: f.nombre,
        },
      });
    }
  }
  const n = await guardar(filas);
  console.log(`${f.nombre}: ${paginas.length} páginas revisadas, ${n} eventos enviados a revisión (los repetidos se ignoran)`);
  total += n;
}
console.log(`Listo: ${total} eventos revisados en total.`);
