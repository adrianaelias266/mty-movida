// Búsqueda de fotos libres (Wikimedia Commons y Openverse) con su crédito.
const AGENTE = 'MtyMovidaBot/1.0 (+https://mty-movida.adrianaelias266.workers.dev)';
async function json(u) { try { const r = await fetch(u, { headers: { 'user-agent': AGENTE, accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.json() : null; } catch { return null; } }
const limpiar = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const CACHE_FOTOS = new Map(); let busquedas = 0;
const MAX_BUSQUEDAS = 120;
const normTxt = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const VACIAS = new Set('de la el los las del en y con para por un una a al gira tour concierto presenta show live mty monterrey 2026 2027 noche fiesta festival taller club evento'.split(' '));
function claves(q) { return normTxt(q).split(' ').filter(w => w.length >= 4 && !VACIAS.has(w)); }
async function fotoCommons(q) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=960`;
  const d = await json(u); const pages = Object.values(d?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const k = claves(q);
  for (const p of pages) {
    const ii = (p.imageinfo || [])[0]; if (!ii || !ii.thumburl || ii.width < 500) continue;
    const m = ii.extmetadata || {}, lic = m.LicenseShortName?.value, autor = limpiar(m.Artist?.value || '');
    if (!lic || !autor || /fair use|non-free/i.test(lic)) continue;
    const t = normTxt(p.title); if (!k.length || !k.every(w => t.includes(w))) continue;   // el nombre del archivo debe mencionar lo que buscamos
    return { foto: ii.thumburl, credito: { autor: autor.slice(0, 80), licencia: lic, url: ii.descriptionurl, fuente: 'Wikimedia Commons' } };
  }
  return null;
}
async function fotoOpenverse(q) {
  const d = await json(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=10&mature=false`);
  const k = claves(q);
  for (const r of d?.results || []) {
    if (!r.url || !r.creator || !r.license || /nc|nd/.test(r.license) || (r.width && r.width < 500)) continue;
    const t = normTxt(r.title + ' ' + (r.tags || []).map(x => x.name).join(' ')); if (!k.length || !k.every(w => t.includes(w))) continue;
    return { foto: r.url, credito: { autor: limpiar(r.creator).slice(0, 80), licencia: `CC ${r.license.toUpperCase()} ${r.license_version || ''}`.trim(), url: r.foreign_landing_url, fuente: 'Openverse' } };
  }
  return null;
}
export async function buscarFoto(q) {
  q = q.trim(); if (claves(q).length === 0) return null;
  if (CACHE_FOTOS.has(q)) return CACHE_FOTOS.get(q);
  if (busquedas >= MAX_BUSQUEDAS) return null; busquedas++;
  const r = (await fotoCommons(q).catch(() => null)) || (await fotoOpenverse(q).catch(() => null));
  CACHE_FOTOS.set(q, r); return r;
}
