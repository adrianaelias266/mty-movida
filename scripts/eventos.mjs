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
  if (f.paginas && f.enlaces) {      // páginas con la lista de eventos: se siguen los enlaces a cada evento
    const urls = [];
    for (const p of f.paginas) {
      const html = await traer(p); if (!html) continue;
      for (const m of html.matchAll(/href="([^"#?]+)/g)) if (f.enlaces.test(m[1])) urls.push(new URL(m[1], p).href);
    }
    return [...new Set(urls)].slice(0, MAX_PAGINAS);
  }
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
  const m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2}):(\d{2}))?/);
  const d = n => String(n).padStart(2, '0');
  return m ? { fecha: `${m[1]}-${d(m[2])}-${d(m[3])}`, hora: m[4] ? `${d(m[4])}:${m[5]}` : null } : null;
}

// Páginas que arman su calendario con JavaScript: se abren en un navegador real (Chromium)
let navegador = null;
async function htmlConNavegador(url) {
  if (!navegador) { const { chromium } = await import('playwright'); navegador = await chromium.launch(); }
  const p = await navegador.newPage({ userAgent: AGENTE });
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(3000);
    return await p.content();
  } catch { return null; } finally { await p.close(); }
}

// Boletera PrimeTickets (Foro 13): la portada trae cada obra y su página trae las funciones
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
async function filasPrimeTickets(f) {
  const portada = await traer(f.sitio); if (!portada) return [];
  const obras = new Map();
  for (const m of portada.matchAll(/background-image:\s*url\('([^']+)'\)[\s\S]*?pt-category-chip-text">([^<]*)<[\s\S]*?pt-title">([^<]+)<[\s\S]*?href="([^"]+)"/g)) {
    if (!obras.has(m[4])) obras.set(m[4], { foto: new URL(m[1], f.sitio).href, tipo: limpiar(m[2]), nombre: limpiar(m[3]) });
  }
  const filas = [];
  for (const [url, o] of obras) {
    const html = await traer(url); if (!html) continue;
    const texto = limpiar(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' '));
    const funciones = [];
    for (const m of texto.matchAll(/(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo) (\d{1,2}) de (\w+) (\d{4}) (\d{1,2}):(\d{2}) (AM|PM)/gi)) {
      const mes = MESES[m[2].toLowerCase()]; if (!mes) continue;
      let h = Number(m[4]) % 12; if (m[6].toUpperCase() === 'PM') h += 12;
      const fecha = `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (new Date(fecha + 'T00:00') >= hoy && new Date(fecha + 'T00:00') <= limite) funciones.push({ fecha, hora: `${String(h).padStart(2, '0')}:${m[5]}` });
    }
    const unicas = [...new Map(funciones.map(x => [x.fecha + x.hora, x])).values()].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    if (!unicas.length) continue;
    const i = texto.indexOf('Información general'), j = texto.indexOf(f.lugarCorto || 'FORO 13', i + 1);
    let desc = i >= 0 ? texto.slice(i + 19, j > i ? j : i + 600).replace(o.nombre, '').trim() : '';
    const fechaTxt = x => { const d = new Date(x.fecha + 'T00:00'); return `${d.getDate()} de ${Object.keys(MESES)[d.getMonth()]} a las ${x.hora} h`; };
    desc = ((desc.length > 320 ? desc.slice(0, 320).replace(/\s+\S*$/, '') + '…' : desc) + (unicas.length > 1 ? ` Funciones: ${unicas.slice(0, 6).map(fechaTxt).join('; ')}.` : '')).trim();
    filas.push({
      fuente: f.nombre, fuente_url: url, foto: o.foto,
      datos: {
        nombre: o.nombre, organizador: f.nombre, categoria: categoria(o.tipo + ' ' + o.nombre + ' ' + desc), municipio: f.municipio,
        fecha: unicas[0].fecha, hora: unicas[0].hora, hasta: unicas.at(-1).fecha !== unicas[0].fecha ? unicas.at(-1).fecha : null,
        lugar: f.lugar || f.nombre, espacio: 'interior', precio: null, caracteristicas: [], descripcion: desc, enlace: url, fuente: f.nombre,
      },
    });
  }
  return filas;
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
  if (f.lector === 'primetickets') {
    const filas = await filasPrimeTickets(f);
    const n = await guardar(filas);
    console.log(`::notice::${f.nombre}: ${n} obras enviadas a revisión (las repetidas se ignoran)`);
    total += n; continue;
  }
  const paginas = await paginasDe(f);
  const filas = [];
  for (const url of paginas) {
    const html = f.navegador ? await htmlConNavegador(url) : await traer(url); if (!html) continue;
    for (const e of eventosLD(html)) {
      const ini = fechaHora(e.startDate), fin = fechaHora(e.endDate || e.startDate); if (!ini) continue;
      const dIni = new Date(ini.fecha + 'T00:00'), dFin = new Date(fin.fecha + 'T00:00');
      if (dFin < hoy || dIni > limite) continue;
      const loc = [].concat(e.location || [])[0] || {};
      const lugar = limpiar([loc.name, typeof loc.address === 'string' ? loc.address : loc.address?.streetAddress].filter(Boolean).join(', '));
      const oferta = [].concat(e.offers || [])[0] || {};
      const precio = oferta.price != null && !isNaN(Number(oferta.price)) ? Number(oferta.price) : (/gratis|libre|free/i.test(JSON.stringify(e)) ? 0 : null);
      const nombre = limpiar(e.name), desc = limpiar(e.description).slice(0, 400);
      if (f.excluir && f.excluir.test(nombre)) continue;   // por ejemplo, clases deportivas que se repiten cada semana
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
  const n = await guardar([...new Map(filas.map(x => [x.fuente_url, x])).values()]);
  console.log(`::notice::${f.nombre}: ${paginas.length} páginas revisadas, ${n} eventos enviados a revisión (los repetidos se ignoran)`);
  total += n;
}
if (navegador) await navegador.close();
console.log(`Listo: ${total} eventos revisados en total.`);
