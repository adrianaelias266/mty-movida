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
const AGENTE = 'MtyMovidaBot/1.0 (https://mty-movida.adrianaelias266.workers.dev; agenda cultural de Monterrey)';

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

const limpiaUrl = u => /feverup\.com\/m\/\d+/.test(u) ? u.replace(/^(https:\/\/feverup\.com\/m\/\d+).*$/, '$1') : /eventbrite\.com/.test(u) ? u.replace(/^https:\/\/www\.eventbrite\.com(\.mx)?\//, 'https://www.eventbrite.com.mx/').split('?')[0] : u;

async function paginasDe(f) {
  if (f.lista && f.listaDirecta) return [...Array(f.paginasLista || 5)].map((_, i) => `${f.lista}?page=${i + 1}`);
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
      for (const m of html.matchAll(/href="(\/[^"#?]+)"/g)) { const u = new URL(m[1], p).href; if (f.enlaces.test(u)) urls.push(limpiaUrl(u)); }
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
    ['teatro', /teatro|obra|comedia|títeres|clown|inmersiv|jurado/], ['cine', /cine|película|cortometraje|proyección|cineteca/], ['expo', /exposición|muestra|galería|museo|inauguración/],
    ['letras', /lectura|poesía|libro|literatura|cuento/], ['concierto', /concierto|orquesta|sinfónic|banda|tour/], ['musica', /música|musical|canto|coro/],
    ['fiestas', /fiesta|festival de calaveras|noche de/], ['gastro', /mercado|bazar|gastronom|comida/], ['naturaleza', /senderismo|caminata|hiking|naturaleza|observaci[oó]n de aves|bosque|cascada|murci[eé]lago|reserva natural|ecol[oó]gic/], ['deporte', /carrera|rodada|yoga/]];
  return (reglas.find(([, r]) => r.test(t)) || ['expo'])[0];
}
function municipio(t, porDefecto) {
  t = t.toLowerCase();
  const r = [['sanpedro', /san pedro/], ['sannicolas', /san nicol/], ['guadalupe', /guadalupe/], ['apodaca', /apodaca/], ['escobedo', /escobedo/],
    ['santacatarina', /santa catarina/], ['garcia', /garc[ií]a/], ['juarez', /ju[aá]rez/], ['santiago', /santiago/],
    ['cadereyta', /cadereyta/], ['pesqueria', /pesquer[ií]a/], ['salinas', /salinas victoria/], ['elcarmen', /el carmen/], ['cienega', /ci[eé]nega de flores/],
    ['allende', /^allende$|ciudad allende|allende,\s*n/], ['otros', /montemorelos|linares|zuazua|abasolo|bustamante|sabinas|villaldama|lampazos|an[aá]huac|galeana|iturbide|aramberri|doctor arroyo|rayones|general ter[aá]n|cerralvo|higueras|hualahuises|el ca[ñn]ón/],
    ['centro', /monterrey/]].find(([, x]) => x.test(t));
  return r ? r[0] : porDefecto;
}
// Distancia en kilómetros al centro de Monterrey
function km(lat, lon) {
  const r = x => x * Math.PI / 180, dLat = r(lat - 25.6866), dLon = r(lon + 100.3161);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(25.6866)) * Math.cos(r(lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
// Planes de Fever sin datos de evento (obras, experiencias): se leen los datos que trae la página
function planFever(html, url) {
  const meta = k => (html.match(new RegExp(`property="og:${k}" content="([^"]*)"`)) || [])[1];
  const ini = (html.match(/"firstActiveSessionDate":"([^"]+)"/) || [])[1]; if (!ini) return null;
  if (!/"cityCode":"MTY"/.test(html)) return null;
  const fin = (html.match(/"lastActiveSessionDate":"([^"]+)"/) || [])[1];
  const lugar = html.match(/"defaultPlace":\{"address":"([^"]*)"[^}]*?"latitude":([-\d.]+)[^}]*?"longitude":([-\d.]+)[^}]*?"name":"([^"]*)"/);
  const precios = [...html.matchAll(/"placeId":\d+,"price":(\d+(?:\.\d+)?)/g)].map(m => Number(m[1])).filter(n => n > 0);
  const nombre = limpiar(meta('title') || '').replace(/^Entradas\s+/i, '').replace(/\s*\|\s*Fever$/i, '');
  return {
    name: nombre, startDate: ini, endDate: fin && fin.slice(0, 10) !== ini.slice(0, 10) ? fin : null, url, image: meta('image'), description: meta('description'),
    location: lugar ? { name: lugar[4], address: { streetAddress: lugar[1], addressLocality: 'Monterrey' }, geo: { latitude: lugar[2], longitude: lugar[3] } } : {},
    offers: precios.length ? { price: Math.min(...precios) } : {},
    funciones: [...new Set([...html.matchAll(/"startsAtIso":"([^"]+)"/g)].map(m => m[1].slice(0, 16)))].sort().map(t => ({ fecha: t.slice(0, 10), hora: t.slice(11, 16) })).filter(x => enRango(x.fecha)).slice(0, 40),
  };
}
function fechaHora(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2}):(\d{2}))?/);
  const d = n => String(n).padStart(2, '0');
  return m ? { fecha: `${m[1]}-${d(m[2])}-${d(m[3])}`, hora: m[4] ? `${d(m[4])}:${m[5]}` : null } : null;
}

// Páginas que arman su calendario con JavaScript: se abren en un navegador real (Chromium)
let navegador = null;
async function htmlConNavegador(url) {
  if (!navegador) { const { chromium } = await import('playwright'); navegador = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()); }
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
      enlace: x.url || f.sitio, fuente: f.nombre, ...(x.funciones && x.funciones.length > 1 ? { funciones: x.funciones } : {}),
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

const entidades = t => String(t || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const PEQ = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'a', 'al', 'con', 'por', 'para', 'un', 'una', 'e', 'o']);
// "MR. SPEED - TRIBUTO A KISS" → "Mr. Speed - Tributo a Kiss" (solo si viene todo en mayúsculas)
const capitalizar = t => t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t) ? t.toLowerCase().split(' ').map((w, i) => i && PEQ.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : t;

// MARCO: exposiciones desde su WordPress (fechas en los campos de la exposición)
async function filasMarco(f) {
  const lista = await json(`${f.sitio}/wp-json/wp/v2/exposiciones?per_page=40&_embed=wp:featuredmedia`) || [];
  const ymd = x => /^\d{8}$/.test(x || '') ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : null;
  return lista.filter(x => !/\/en\//.test(x.link)).map(x => {
    const ini = ymd(x.acf?.start_date), fin = ymd(x.acf?.end_date) || ini; if (!ini || !enRango(ini, fin)) return null;
    let nombre = limpiar(entidades(x.title?.rendered)); const autor = limpiar(entidades(x.acf?.autor || ''));
    if (/:$/.test(nombre) && autor) nombre = `${nombre} ${autor}`;
    const curada = autor && !nombre.includes(autor) ? `${autor}. ` : '';
    return fila(f, { id: x.link, nombre, fecha: ini, hasta: fin, hora: null, cat: 'expo', espacio: 'interior', url: x.link,
      foto: x._embedded?.['wp:featuredmedia']?.[0]?.source_url, desc: `${curada}Exposición en el Museo de Arte Contemporáneo de Monterrey. Abre de martes a domingo.` });
  }).filter(Boolean);
}

// Superboletos: su catálogo de eventos de todo el país, en un solo archivo de datos
// Funciones de un evento de Superboletos con varias fechas: se leen de la página del evento
async function funcionesSuperboletos(url) {
  const h = await traer(url); if (!h) return [];
  const fs = [...h.matchAll(/"presentation_date":"(\d{2})\/(\d{2})\/(\d{4})","presentation_time":"(\d{1,2}):(\d{2})"/g)]
    .map(m => ({ fecha: `${m[3]}-${m[2]}-${m[1]}`, hora: `${m[4].padStart(2, '0')}:${m[5]}` })).filter(x => enRango(x.fecha));
  return [...new Map(fs.map(x => [x.fecha + x.hora, x])).values()].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}
async function filasSuperboletos(f) {
  const lista = await json(f.datos) || [];
  const TIPO = { conciertos: 'concierto', teatro: 'teatro', deportes: 'deporte', familiares: 'teatro', ferias: 'fiestas', festivales: 'concierto' };
  const filas = lista.filter(e => /nuevo le/i.test(e.nombreEstado || '') && !(f.excluir && f.excluir.test(e.nombreEvento || ''))).map(e => {
    const m = String(e.fechaPrimeraPresentacion || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?/); if (!m) return null;
    const fecha = `${m[3]}-${m[2]}-${m[1]}`; if (!enRango(fecha)) return null;
    const hora = (String(e.fechas || '').match(/(\d{1,2}:\d{2})\s*Hrs/i) || [])[1]?.padStart(5, '0') || (m[4] ? `${m[4]}:${m[5]}` : null);
    const nombre = capitalizar(limpiar(entidades(e.nombreEvento))), pmin = Number(e.precioMinimo) || 0;
    const tipo = String(e.claveTipoEvento || '').toLowerCase();
    const r = fila(f, { id: `${f.enlace}${e.eventoId}`, nombre, fecha, hora, lugar: limpiar(e.nombreRecinto), municipio: municipio(e.nombreCiudad || '', f.municipio),
      cat: TIPO[tipo] || categoria(nombre + ' ' + tipo + ' ' + (e.claveSubtipo || '')), precio: pmin > 0 ? pmin : null, foto: e.rutaImagenMain || e.rutaImagenThumb,
      url: `${f.enlace}${e.eventoId}`, organizador: limpiar(e.nombreRecinto) || f.nombre, desc: [e.artista && `Con ${capitalizar(e.artista)}.`, e.fechas && `Fecha: ${limpiar(entidades(e.fechas))}.`].filter(Boolean).join(' ') });
    r._varias = /^del\s/i.test(String(e.fechas || '')); return r;
  }).filter(Boolean);
  for (const x of filas) {   // eventos con varias funciones ("Del vie. 30 de octubre al dom. 1 de noviembre")
    const v = x._varias; delete x._varias; if (!v) continue;
    const fs = await funcionesSuperboletos(x.datos.enlace);
    if (fs.length) { x.datos.fecha = fs[0].fecha; x.datos.hora = fs[0].hora; if (fs.length > 1) x.datos.funciones = fs; }
  }
  return filas;
}

// Devuelve el texto de un objeto {...} que empieza en "desde", respetando las comillas
function objetoJSON(t, desde) {
  let n = 0, enTexto = false, esc = false;
  for (let k = desde; k < t.length; k++) {
    const c = t[k];
    if (enTexto) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') enTexto = true; else if (c === '{') n++; else if (c === '}') { n--; if (n === 0) return t.slice(desde, k + 1); }
  }
  return '';
}
// Cinemex: la página de próximos estrenos trae la lista de películas dentro de su código (var upcoming = {...})
async function filasCinemex(f) {
  const html = await traer(f.sitio); if (!html) return [];
  const i = html.indexOf('var upcoming='); if (i < 0) return [];
  let datos; try { datos = JSON.parse(objetoJSON(html, i + 13)); } catch { return []; }
  const https = u => u ? (u.startsWith('//') ? 'https:' + u : u) : null;
  return (datos.movies || []).filter(m => /^\d{4}-\d{2}-\d{2}$/.test(m.release_date || '') && enRango(m.release_date)).map(m => {
    const inf = m.info || {}, gen = [].concat(inf.genre || []).join(', ');
    const datosPeli = [gen, inf.duration, inf.director && `Dirección: ${inf.director}`].filter(Boolean).join(' · ');
    return fila(f, { id: `cinemex-estreno-${m.id}`, nombre: limpiar(m.name), fecha: m.release_date, hora: null, cat: 'cine', espacio: 'interior',
      lugar: f.lugar, url: https(m.url) || f.sitio, foto: https(m.poster_medium || m.poster_small || m.cover),
      desc: `Estreno en cines. ${datosPeli ? datosPeli + '. ' : ''}${limpiar(inf.sinopsis || '')}` });
  });
}

// Ticketmaster: su servicio oficial de consulta (Discovery API). Necesita la llave TICKETMASTER_KEY guardada en GitHub.
async function filasTicketmaster(f) {
  const llave = process.env.TICKETMASTER_KEY; if (!llave) { console.log('::notice::Ticketmaster: falta la llave TICKETMASTER_KEY, se omite'); return []; }
  const desde = hoy.toISOString().slice(0, 19) + 'Z', hasta = limite.toISOString().slice(0, 19) + 'Z', filas = [];
  for (let pg = 0; pg < 5; pg++) {
    const d = await json(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${llave}&countryCode=MX&latlong=25.6866,-100.3161&radius=60&unit=km&locale=es-mx&size=200&sort=date,asc&startDateTime=${desde}&endDateTime=${hasta}&page=${pg}`);
    const evs = d?._embedded?.events || []; if (!evs.length) break;
    for (const e of evs) {
      const fecha = e.dates?.start?.localDate; if (!fecha || !enRango(fecha)) continue;
      const v = e._embedded?.venues?.[0] || {}, cl = e.classifications?.[0] || {};
      const seg = String(cl.segment?.name || '').toLowerCase(), gen = String(cl.genre?.name || '');
      const img = (e.images || []).filter(x => x.ratio === '16_9').sort((a, b) => b.width - a.width)[0] || (e.images || [])[0];
      const pr = (e.priceRanges || [])[0];
      filas.push(fila(f, { id: e.url || `ticketmaster-${e.id}`, nombre: limpiar(e.name), fecha, hora: e.dates?.start?.localTime?.slice(0, 5) || null,
        lugar: limpiar([v.name, v.address?.line1].filter(Boolean).join(', ')), municipio: municipio(v.city?.name || '', f.municipio), organizador: limpiar(v.name) || f.nombre,
        cat: /music/.test(seg) ? 'concierto' : /arts|theatre/.test(seg) ? 'teatro' : /sport/.test(seg) ? 'deporte' : /family/.test(seg) ? 'teatro' : categoria(e.name + ' ' + gen),
        precio: pr && pr.min ? Math.round(pr.min) : null, foto: img?.url, url: e.url, desc: limpiar(e.info || e.pleaseNote || [gen, v.name].filter(Boolean).join(' · ')) }));
    }
    if ((d.page?.totalPages || 1) <= pg + 1) break;
  }
  return filas;
}

// Eventos capturados a mano o desde el navegador (por ejemplo, Passline): archivo public/data/<nombre>.json en el repositorio
// Reserva Natural Chipinque: su aplicación lee una lista de eventos (JSON)
async function filasChipinque(f) {
  const d = await json(f.datos); const iso = x => x.toISOString().slice(0, 10);
  return (d?.events || []).map(e => {
    let fecha = (e.date || '').slice(0, 10);
    if (!fecha && e.frequency === 'semanal' && /domingo/i.test(e.schedule || '')) { const x = new Date(hoy); x.setDate(x.getDate() + (7 - x.getDay()) % 7); fecha = iso(x); }
    if (!fecha || !enRango(fecha)) return null;
    const precio = (String(e.price || '').match(/\$\s*([\d,.]+)/) || [])[1];
    return fila(f, {
      id: `${f.datos}#${e.id}#${fecha}`, nombre: limpiar(e.title), fecha, hora: hora12(e.time), lugar: `${limpiar(e.location)}, Reserva Natural Chipinque`.replace(/^Reserva Natural Chipinque, /, ''),
      desc: limpiar([e.subtitle && e.subtitle + '.', e.description, e.frequency === 'semanal' && `${e.schedule}.`, e.time && `Horario: ${e.time}.`].filter(Boolean).join(' ')),
      cat: /taller|infantil/i.test(e.category || '') ? categoria(`${e.categoryLabel || ''} ${e.title}`) : /yoga|sound|medita/i.test(e.title) ? 'deporte' : 'naturaleza', precio: precio ? Number(precio.replace(/,/g, '')) : null, espacio: 'exterior', municipio: 'sanpedro',
      organizador: 'Reserva Natural Chipinque', url: f.sitio, foto: e.imageUrl ? f.medios + e.imageUrl : null,
    });
  }).filter(Boolean);
}

async function filasArchivo(f) {
  const { readFileSync, existsSync } = await import('node:fs');
  if (!existsSync(f.archivo)) return [];
  let lista; try { lista = JSON.parse(readFileSync(f.archivo, 'utf8')); } catch { return []; }
  return (lista.eventos || lista).filter(e => e.fecha && enRango(e.fecha, e.hasta)).map(e => fila(f, { ...e, organizador: e.organizador || (e.lugar || '').split(',')[0] || f.nombre, id: e.url ? `${e.url}#${e.fecha}` : `${f.nombre}-${e.nombre}-${e.fecha}`,
    municipio: e.municipio || municipio(e.lugar || '', f.municipio) }));
}

const LECTORES = { chipinque: filasChipinque, ticketmaster: filasTicketmaster, archivo: filasArchivo, cinemex: filasCinemex, marco: filasMarco, superboletos: filasSuperboletos, civitas: filasCivitas, tribe: filasTribe, payload: filasPayload, nlgob: filasNLGob, primetickets: f => filasPrimeTickets(f) };

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
    // El precio está en la página de cada función ("Buscar boletos")
    let precio = null;
    const funcion = (html.match(/href="(https?:\/\/[^"]+\/evnt\d+)"/) || [])[1];
    if (funcion) {
      const pf = await traer(funcion) || '';
      const precios = [...pf.matchAll(/"price"\s*:\s*"?(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
      if (precios.length) precio = Math.min(...precios);
    }
    const i = texto.indexOf('Información general'), j = texto.indexOf(f.lugarCorto || 'FORO 13', i + 1);
    let desc = i >= 0 ? texto.slice(i + 19, j > i ? j : i + 600).replace(o.nombre, '').trim() : '';
    const fechaTxt = x => { const d = new Date(x.fecha + 'T00:00'); return `${d.getDate()} de ${Object.keys(MESES)[d.getMonth()]} a las ${x.hora} h`; };
    desc = ((desc.length > 320 ? desc.slice(0, 320).replace(/\s+\S*$/, '') + '…' : desc) + (unicas.length > 1 ? ` Funciones: ${unicas.slice(0, 6).map(fechaTxt).join('; ')}.` : '')).trim();
    filas.push({
      fuente: f.nombre, fuente_url: url, foto: o.foto, estado: ESTADO,
      datos: {
        nombre: o.nombre, organizador: f.nombre, categoria: categoria(o.tipo + ' ' + o.nombre + ' ' + desc), municipio: f.municipio,
        fecha: unicas[0].fecha, hora: unicas[0].hora, hasta: null, ...(unicas.length > 1 ? { funciones: unicas } : {}),
        lugar: f.lugar || f.nombre, espacio: 'interior', precio, caracteristicas: [], descripcion: desc, enlace: url, fuente: f.nombre,
      },
    });
  }
  return filas;
}

async function guardar(filas) {
  // Se envía uno por uno: si ya existe (misma dirección), Supabase responde 409.
  // Con la llave secreta, a los que ya existen se les actualizan fecha, precio, foto y descripción.
  let nuevos = 0;
  const h = { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' };
  for (const fila of filas) {
    const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados`, { method: 'POST', headers: h, body: JSON.stringify(fila) });
    if (r.ok) { nuevos++; continue; }
    if (r.status !== 409) throw new Error(`Supabase respondió ${r.status}: ${await r.text()}`);
    if (SECRETA) await fetch(`${SB_URL}/rest/v1/eventos_enviados?fuente_url=eq.${encodeURIComponent(fila.fuente_url)}&estado=eq.aprobado`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ datos: fila.datos, foto: fila.foto }),
    });
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
// Fuentes que se dejaron de usar: sus eventos se retiran de la página
const RETIRADAS = ['Meetup'];
if (SECRETA) {
  const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados?fuente=in.(${RETIRADAS.map(encodeURIComponent).join(',')})&estado=eq.aprobado`, {
    method: 'PATCH', headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ estado: 'rechazado' }),
  });
  if (!r.ok) console.log(`::warning::No se pudieron retirar las fuentes viejas: ${r.status}`);
}

import { buscarFoto } from './fotos.mjs';

import { artistaDe, famaDe } from './fama.mjs';

let FALLA_FAMA = '';
async function completarFama(filas) {
  let n = 0, c = 0;
  for (const x of filas) {
    if (!/concierto|musica|teatro|danza/.test(x.datos.categoria || '')) continue;
    c++; try { x.datos.fama = await famaDe(artistaDe(x.datos.nombre)); if (x.datos.fama) n++; } catch (e) { x.datos.fama = 0; FALLA_FAMA = String(e); }
  }
  if (c) console.log(`::notice::${filas[0]?.fuente}: reconocimiento medido en ${n} de ${c}${FALLA_FAMA ? ' · error: ' + FALLA_FAMA.slice(0, 120) : ''}${ultimoEstado ? ' · última respuesta: ' + ultimoEstado : ''}`);
}

async function completarFotos(filas) {
  let n = 0;
  for (const x of filas) {
    if (x.foto) continue;
    const d = x.datos, cat = d.categoria;
    // 1) el artista o la obra (lo que va antes de ":" o " - "), solo para música, conciertos, teatro y danza
    const artista = d.nombre.split(/\s[-–|@]\s|:|\(/)[0];
    let r = ['concierto', 'musica', 'teatro', 'danza'].includes(cat) ? await buscarFoto(artista, 'artista') : null;
    // 2) el lugar del evento
    if (!r && d.lugar) r = await buscarFoto(d.lugar.split(',')[0], 'lugar');
    if (r) { x.foto = r.foto; d.credito = r.credito; n++; }
  }
  return n;
}

let total = 0, fallas = 0;
for (const f of FUENTES) {
 try {
  if (f.lector) {
    const filas = (await LECTORES[f.lector](f)).filter(x => !(f.excluir && f.excluir.test(x.datos.nombre)));
    await completarFama(filas);
    const nf = await completarFotos(filas); if (nf) console.log(`::notice::${f.nombre}: ${nf} fotos libres encontradas`);
    const n = await guardar([...new Map(filas.map(x => [x.fuente_url, x])).values()]);
    console.log(`::notice::${f.nombre}: ${filas.length} eventos encontrados, ${n} nuevos`);
    if (f.lector === 'archivo' && SECRETA && filas.length) {   // el archivo manda: lo que se quitó de él se retira de la página
      const lista = filas.map(x => `"${x.fuente_url.replace(/"/g, '\\"')}"`).join(',');
      const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados?fuente=eq.${encodeURIComponent(f.nombre)}&estado=eq.aprobado&fuente_url=not.in.(${encodeURIComponent(lista)})`, {
        method: 'PATCH', headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, 'content-type': 'application/json', prefer: 'return=representation' },
        body: JSON.stringify({ estado: 'rechazado' }),
      });
      if (r.ok) { const q = (await r.json()).length; if (q) console.log(`::notice::${f.nombre}: ${q} eventos retirados porque ya no están en el archivo`); }
      else console.log(`::warning::${f.nombre}: no se pudieron retirar eventos viejos: ${r.status}`);
    }
    total += n; continue;
  }
  const paginas = await paginasDe(f);
  const filas = [];
  for (const url of paginas) {
    const html = f.navegador ? await htmlConNavegador(url) : await traer(url); if (!html) continue;
    const lds = eventosLD(html);
    if (!lds.length && f.planFever) { const x = planFever(html, url); if (x) lds.push(x); }
    for (const e of lds) {
      const ini = fechaHora(e.startDate), fin = fechaHora(e.endDate || e.startDate); if (!ini) continue;
      const dIni = new Date(ini.fecha + 'T00:00'), dFin = new Date(fin.fecha + 'T00:00');
      if (dFin < hoy || dIni > limite) continue;
      const loc = [].concat(e.location || [])[0] || {};
      const lugar = limpiar([loc.name, typeof loc.address === 'string' ? loc.address : loc.address?.streetAddress].filter(Boolean).join(', '));
      const ciudad = limpiar(loc.address?.addressLocality || '');
      if (f.radioKm && loc.geo?.latitude != null && km(Number(loc.geo.latitude), Number(loc.geo.longitude)) > f.radioKm) continue;
      if (f.soloEstado && loc.address?.addressRegion && !f.soloEstado.test(loc.address.addressRegion)) continue;
      const oferta = [].concat(e.offers || [])[0] || {};
      const p0 = oferta.price ?? oferta.lowPrice;
      const precio = p0 != null && !isNaN(Number(p0)) ? Number(p0) : (/gratis|libre|free/i.test(JSON.stringify(e)) ? 0 : null);
      const nombre = limpiar(e.name).replace(f.limpiarNombre || /$^/, '').trim(), desc = limpiar(e.description).slice(0, 400);
      if (f.excluir && f.excluir.test(nombre)) continue;   // por ejemplo, clases deportivas que se repiten cada semana
      const enLinea = /Online/.test(String(e.eventAttendanceMode || ''));
      filas.push({
        fuente: f.nombre,
        fuente_url: `${limpiaUrl(e.url || url)}#${e.startDate}`, estado: ESTADO,
        foto: [].concat(e.image || [])[0]?.url || [].concat(e.image || [])[0] || null,
        datos: {
          nombre, organizador: (f.organizadorDelEvento && limpiar([].concat(e.organizer || [])[0]?.name)) || (f.organizadorLugar && limpiar(loc.name)) || f.nombre, categoria: f.cat || categoria(nombre + ' ' + desc), municipio: enLinea ? 'linea' : ciudad ? municipio(ciudad, 'otros') : municipio(lugar, f.municipio),
          fecha: ini.fecha, hora: ini.hora, hasta: fin.fecha !== ini.fecha && !(e.funciones && e.funciones.length > 1) ? fin.fecha : null, lugar, espacio: null, precio,
          caracteristicas: [], descripcion: desc, enlace: limpiaUrl(e.url || url), fuente: f.nombre, ...(e.funciones && e.funciones.length > 1 ? { funciones: e.funciones } : {}),
        },
      });
    }
  }
  const unicas = [...new Map(filas.map(x => [x.fuente_url, x])).values()];
  await completarFama(unicas);
  const nf = await completarFotos(unicas); if (nf) console.log(`::notice::${f.nombre}: ${nf} fotos libres encontradas`);
  const n = await guardar(unicas);
  console.log(`::notice::${f.nombre}: ${paginas.length} páginas revisadas, ${n} eventos nuevos`);
  total += n;
 } catch (err) {
  fallas++;
  console.log(`::error::${f.nombre}: ${String(err?.message || err).slice(0, 500)}`);
 }
}
if (navegador) await navegador.close();
console.log(`Listo: ${total} eventos revisados en total.`);
if (FUENTES.length && fallas === FUENTES.length) process.exit(1);
