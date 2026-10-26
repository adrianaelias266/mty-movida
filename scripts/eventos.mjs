// Recolector de eventos: revisa los sitios de scripts/fuentes.mjs, busca las páginas de
// eventos en su mapa del sitio (sitemap) y lee los datos que publican en formato
// schema.org/Event. Cada evento nuevo entra a Supabase como "pendiente" para revisión.
import { FUENTES as LISTA } from './fuentes.mjs';
const SOLO = (process.env.SOLO || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);  // para probar solo algunas fuentes
const FUENTES = (process.env.FUENTES_PRUEBA ? JSON.parse(process.env.FUENTES_PRUEBA).map(f => ({ ...f, filtro: new RegExp(f.filtro) })) : LISTA)
  .filter(f => !SOLO.length || SOLO.some(x => f.nombre.toLowerCase().includes(x)));

const SB_URL = process.env.SUPABASE_URL || 'https://aqakoihxgwxdyrtzjrfh.supabase.co';
// Con la llave secreta (guardada en GitHub › Secrets como SUPABASE_SECRET) los eventos de estas fuentes
// entran ya aprobados. Sin ella, entran como "pendiente" para revisión.
const SECRETA = process.env.SUPABASE_SECRET || '';
const SB_KEY = SECRETA || process.env.SUPABASE_KEY || 'sb_publishable_LfR-ayNY5bpv2xlO8pkEXQ_sE4nP0BG';
const ESTADO = SECRETA ? 'aprobado' : 'pendiente';
const MAX_PAGINAS = 80;          // páginas por fuente en cada corrida
const DIAS_ADELANTE = 90;        // solo eventos de hoy a 90 días
const AGENTE = 'MtyMovidaBot/1.0 (+agenda cultural de Monterrey)';

const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const limite = new Date(hoy.getTime() + DIAS_ADELANTE * 864e5);

let ultimoEstado = '';
async function traer(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': AGENTE, accept: 'text/html,application/xml', 'accept-language': 'es-MX,es;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    ultimoEstado = r.status;
    return r.ok ? await r.text() : null;
  } catch (e) { ultimoEstado = String(e?.name || e); return null; }
}
const locs = xml => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>(?:[\s\S]*?<lastmod>([^<]+)<\/lastmod>)?/g)].map(m => ({ url: m[1].replace(/&amp;/g, '&'), mod: m[2] }));

const limpiaUrl = u => /eventbrite\.com/.test(u) ? u.replace(/^https:\/\/www\.eventbrite\.com(\.mx)?\//, 'https://www.eventbrite.com.mx/').split('?')[0] : u;

async function paginasDe(f) {
  if (f.lista) {                     // listado con varias páginas (por ejemplo, Eventbrite en Nuevo León)
    const urls = [];
    for (let n = 1; n <= (f.paginasLista || 40); n++) {
      let html = await traer(`${f.lista}?page=${n}`);
      if (!html || !eventosLD(html).length) {           // si la página no responde bien, se intenta con el navegador
        console.log(`::warning::${f.nombre}: página ${n} sin eventos (respuesta ${ultimoEstado}); se intenta con navegador`);
        html = await htmlConNavegador(`${f.lista}?page=${n}`);
      }
      if (!html) break;
      const evs = eventosLD(html); if (!evs.length) break;
      for (const e of evs) if (e.url && !(f.excluir && f.excluir.test(limpiar(e.name)))) urls.push(limpiaUrl(e.url));
    }
    return [...new Set(urls)].slice(0, f.max || MAX_PAGINAS);
  }
  if (f.paginas && f.enlaces) {      // páginas con la lista de eventos: se siguen los enlaces a cada evento
    const urls = [];
    for (const p of f.paginas) {
      const html = await traer(p); if (!html) { console.log(`::warning::${f.nombre}: no se pudo abrir ${p}`); continue; }
      for (const m of html.matchAll(/(?:href=")?(https?:\/\/[^"'\s<>#?\\]+)/g)) if (f.enlaces.test(m[1])) urls.push(limpiaUrl(m[1]));
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

// ---------- Lectores especiales (páginas que publican sus eventos a su manera) ----------
const enRango = (fecha, hasta) => { const a = new Date(fecha + 'T00:00'), b = new Date((hasta || fecha) + 'T00:00'); return b >= hoy && a <= limite; };
const mtyHora = iso => {   // fecha en hora universal → fecha y hora de Monterrey (UTC−6, sin horario de verano)
  const d = new Date(new Date(iso).getTime() - 6 * 3600e3);
  return { fecha: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16) };
};
const hora12 = t => { const m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m|p\.?\s?m)/i); if (!m) { const n = String(t || '').match(/(\d{1,2}):(\d{2})/); return n ? `${n[1].padStart(2, '0')}:${n[2]}` : null; } let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return `${String(h).padStart(2, '0')}:${m[2] || '00'}`; };
function fila(f, x) {
  return {
    fuente: f.nombre, fuente_url: x.id, foto: x.foto || null, estado: ESTADO,
    datos: {
      nombre: x.nombre, organizador: x.organizador || f.nombre, categoria: x.cat || categoria(x.nombre + ' ' + (x.desc || '')),
      municipio: x.municipio || municipio(x.lugar || '', f.municipio), fecha: x.fecha, hora: x.hora || null, hasta: x.hasta && x.hasta !== x.fecha ? x.hasta : null,
      lugar: x.lugar || f.lugar || f.nombre, espacio: x.espacio || null, precio: x.precio ?? null, caracteristicas: [], descripcion: (x.desc || '').slice(0, 400),
      enlace: x.url || f.sitio, fuente: f.nombre,
    },
  };
}
const json = async u => { const t = await traer(u); try { return t ? JSON.parse(t) : null; } catch { return null; } };

// Centro Cívitas: su página lee una lista de datos (JSON)
async function filasCivitas(f) {
  const lista = await json(f.datos) || [];
  return lista.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.Fecha) && enRango(e.Fecha)).map(e => fila(f, {
    id: `${f.datos}#${e.Id}`, nombre: limpiar(e.Nombre), fecha: e.Fecha, hora: hora12(e.Hora), lugar: limpiar(e.Lugar),
    desc: limpiar([e.Descripcion, e.Hora && `Horario: ${e.Hora}.`].filter(Boolean).join(' ')), precio: /sin costo|gratis|libre/i.test(e.Cobro || '') ? 0 : null, url: f.sitio,
  }));
}

// Sitios WordPress con "The Events Calendar" (por ejemplo, Parque Fundidora)
async function filasTribe(f) {
  const d = await json(`${f.sitio}/wp-json/tribe/events/v1/events?per_page=50&start_date=${hoy.toISOString().slice(0, 10)}`);
  return (d?.events || []).map(e => {
    const fecha = String(e.start_date).slice(0, 10), hasta = String(e.end_date || '').slice(0, 10);
    if (!enRango(fecha, hasta)) return null;
    const v = e.venue || {};
    const costo = String(e.cost || '');
    return fila(f, {
      id: e.url, nombre: limpiar(e.title), fecha, hasta, hora: e.all_day ? null : String(e.start_date).slice(11, 16),
      lugar: limpiar([v.venue, v.address].filter(Boolean).join(', ')) || f.lugar, desc: limpiar(e.excerpt || e.description),
      foto: e.image?.url, url: e.url, precio: /gratis|libre|free/i.test(costo) ? 0 : (parseFloat(costo.replace(/[^\d.]/g, '')) || null),
    });
  }).filter(Boolean);
}

// LABNL: su sitio usa el gestor Payload, que entrega las actividades como datos
async function filasPayload(f) {
  const d = await json(`${f.sitio}/payload/activities?sort=-startDate&limit=40&depth=1&where[_status][equals]=published&where[type][equals]=activity`);
  return (d?.docs || []).map(e => {
    if (!e.startDate) return null;
    const ini = mtyHora(e.startDate), fin = e.endDate ? mtyHora(e.endDate) : ini;
    if (!enRango(ini.fecha, fin.fecha)) return null;
    const cats = (e.activityCategories || []).map(c => c.category).join(' ');
    return fila(f, {
      id: `${f.sitio}/actividad/${e.slug}`, nombre: limpiar(e.title), fecha: ini.fecha, hasta: fin.fecha, hora: ini.hora,
      desc: limpiar(e.meta?.description || ''), cat: categoria(cats + ' ' + e.title + ' ' + (e.meta?.description || '')),
      foto: e.featuredImage?.sizes?.hero?.url || e.featuredImage?.url, url: `${f.sitio}/actividad/${e.slug}`, precio: 0, espacio: 'interior',
    });
  }).filter(Boolean);
}

// Gobierno de Nuevo León (Drupal): lista con fechas y una página por evento con lugar y horario
async function filasNLGob(f) {
  const dmy = t => { const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const filas = [];
  for (let pg = 0; pg < (f.paginasLista || 4); pg++) {
    const html = await traer(`${f.lista}?page=${pg}`); if (!html) break;
    const enlaces = [...new Set([...html.matchAll(/href="(\/es\/evento\/[a-z0-9-]+)"/g)].map(m => m[1]))];
    if (!enlaces.length) break;
    for (const rel of enlaces) {
      const i = html.indexOf(rel), trozo = limpiar(html.slice(Math.max(0, i - 900), i));
      const fechas = [...trozo.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map(m => dmy(m[0]));
      const fin = fechas.at(-1); if (fin && new Date(fin + 'T00:00') < hoy) continue;   // ya pasó, no se abre
      const url = new URL(rel, f.lista).href, pag = await traer(url); if (!pag) continue;
      const titulo = limpiar((pag.match(/field--name-title[^>]*>([\s\S]*?)<\//) || [])[1] || '');
      const cuerpo = limpiar((pag.match(/field--name-body[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      const foto = (pag.match(/https?:\/\/[^"']+\/Eventos\/[^"']+\.(?:jpe?g|png|webp)/i) || [])[0];
      for (const b of pag.split('seccion_datos').slice(1)) {
        const txt = limpiar(b.replace(/<style[\s\S]*?<\/style>/g, ' ')).replace(/location_on|today|schedule/g, ' ');
        const fecha = dmy(txt); if (!fecha || !enRango(fecha)) continue;
        const lugar = limpiar((b.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '').replace(/location_on/g, '').trim();
        const dir = limpiar((b.match(/caja_dato">\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '');
        filas.push(fila(f, {
          id: `${url}#${fecha}`, nombre: titulo, fecha, hora: (txt.match(/(\d{1,2}:\d{2})\s*-/) || [])[1]?.padStart(5, '0') || null,
          lugar: [lugar, dir].filter(Boolean).join(', '), desc: cuerpo, foto: foto ? encodeURI(decodeURI(foto)) : null, url,
        }));
      }
    }
  }
  return filas;
}

const LECTORES = { civitas: filasCivitas, tribe: filasTribe, payload: filasPayload, nlgob: filasNLGob, primetickets: f => filasPrimeTickets(f) };

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
      fuente: f.nombre, fuente_url: url, foto: o.foto, estado: ESTADO,
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
  // Se envía uno por uno: si ya existe (misma dirección), Supabase responde 409 y se ignora
  let nuevos = 0;
  for (const fila of filas) {
    const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados`, {
      method: 'POST',
      headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(fila),
    });
    if (r.ok) nuevos++;
    else if (r.status !== 409) throw new Error(`Supabase respondió ${r.status}: ${await r.text()}`);
  }
  return nuevos;
}

if (SECRETA) {
  const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados?estado=eq.pendiente&fuente=neq.Organizador`, {
    method: 'PATCH', headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ estado: 'aprobado' }),
  });
  console.log(r.ok ? '::notice::Los pendientes del recolector quedaron aprobados' : `::warning::No se pudieron aprobar los pendientes: ${r.status}`);
} else console.log('::notice::Sin llave secreta: los eventos entran como pendientes');

let total = 0, fallas = 0;
for (const f of FUENTES) {
 try {
  if (f.lector) {
    const filas = (await LECTORES[f.lector](f)).filter(x => !(f.excluir && f.excluir.test(x.datos.nombre)));
    const n = await guardar([...new Map(filas.map(x => [x.fuente_url, x])).values()]);
    console.log(`::notice::${f.nombre}: ${filas.length} eventos encontrados, ${n} nuevos`);
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
      const ciudad = limpiar(loc.address?.addressLocality || '');
      if (f.soloEstado && loc.address?.addressRegion && !f.soloEstado.test(loc.address.addressRegion)) continue;
      const oferta = [].concat(e.offers || [])[0] || {};
      const p0 = oferta.price ?? oferta.lowPrice;
      const precio = p0 != null && !isNaN(Number(p0)) ? Number(p0) : (/gratis|libre|free/i.test(JSON.stringify(e)) ? 0 : null);
      const nombre = limpiar(e.name), desc = limpiar(e.description).slice(0, 400);
      if (f.excluir && f.excluir.test(nombre)) continue;   // por ejemplo, clases deportivas que se repiten cada semana
      const enLinea = /Online/.test(String(e.eventAttendanceMode || ''));
      filas.push({
        fuente: f.nombre,
        fuente_url: `${limpiaUrl(e.url || url)}#${e.startDate}`, estado: ESTADO,
        foto: [].concat(e.image || [])[0]?.url || [].concat(e.image || [])[0] || null,
        datos: {
          nombre, organizador: (f.organizadorDelEvento && limpiar([].concat(e.organizer || [])[0]?.name)) || f.nombre, categoria: categoria(nombre + ' ' + desc), municipio: enLinea ? 'linea' : municipio(lugar + ' ' + ciudad, f.municipio),
          fecha: ini.fecha, hora: ini.hora, hasta: fin.fecha !== ini.fecha ? fin.fecha : null, lugar, espacio: null, precio,
          caracteristicas: [], descripcion: desc, enlace: limpiaUrl(e.url || url), fuente: f.nombre,
        },
      });
    }
  }
  const n = await guardar([...new Map(filas.map(x => [x.fuente_url, x])).values()]);
  console.log(`::notice::${f.nombre}: ${paginas.length} páginas revisadas, ${n} eventos nuevos`);
  total += n;
 } catch (err) {
  fallas++;
  console.log(`::error::${f.nombre}: ${String(err?.message || err).slice(0, 500)}`);
 }
}
if (navegador) await navegador.close();
console.log(`Listo: ${total} eventos revisados en total.`);
if (fallas === FUENTES.length) process.exit(1);
