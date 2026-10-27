// Qué tan reconocido es un artista: visitas de los últimos 30 días a su página de Wikipedia (en español e inglés).
// Escala 0 a 7 (logarítmica: 4 = unas 10,000 visitas al mes). Solo cuenta si el título del artículo coincide con el nombre del artista.
const AGENTE = 'MtyMovidaBot/1.0 (https://mty-movida.adrianaelias266.workers.dev; agenda cultural de Monterrey)';
const json = async u => { try { const r = await fetch(u, { headers: { 'user-agent': AGENTE, accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.json() : null; } catch { return null; } };
const limpiar = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const FAMA = new Map();
const sinAcentos = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function artistaDe(nombre) {
  return limpiar(nombre).split(/\s+[-–|:]\s+|:\s|\s+en\s+(?:monterrey|concierto|vivo|el|la|los|las)\b|\s+(?:gratis|tour|gira|world tour|live)\b|\s*[(,·]/i)[0].trim();
}
async function visitas(lang, titulo) {
  const fin = new Date(hoy.getTime() - 864e5), ini = new Date(fin.getTime() - 29 * 864e5), f = d => d.toISOString().slice(0, 10).replace(/-/g, '');
  const d = await json(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${encodeURIComponent(titulo.replace(/ /g, '_'))}/daily/${f(ini)}/${f(fin)}`);
  return (d?.items || []).reduce((n, x) => n + (x.views || 0), 0);
}
export async function famaDe(artista) {
  const k = sinAcentos(artista); if (k.length < 4 || k.split(' ').length > 5) return 0;
  if (FAMA.has(k)) return FAMA.get(k);
  let total = 0;
  for (const lang of ['es', 'en']) {
    const d = await json(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(artista)}&srlimit=3&format=json&origin=*`);
    const hit = (d?.query?.search || []).find(x => sinAcentos(x.title.replace(/\s*\(.*\)$/, '')) === k);
    if (hit) total = Math.max(total, await visitas(lang, hit.title));
  }
  const v = total > 0 ? Math.round(Math.log10(total) * 10) / 10 : 0;
  FAMA.set(k, v); return v;
}
