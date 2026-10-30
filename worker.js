// Mty Movida en Cloudflare: sirve la página (carpeta public) y, además,
// el calendario de cada persona en /cal/<id>.ics para Google Calendar, Outlook y el iPhone.
const SUPABASE = 'https://aqakoihxgwxdyrtzjrfh.supabase.co';
const VACIO = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mty Movida//Mi calendario//ES\r\nX-WR-CALNAME:Mty Movida\r\nEND:VCALENDAR\r\n';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/cal\/([0-9a-f-]{36})\.ics$/i);
    if (m) {
      const r = await fetch(`${SUPABASE}/storage/v1/object/public/calendarios/${m[1].toLowerCase()}.ics?v=${Date.now()}`);
      const cuerpo = r.ok ? await r.text() : VACIO;   // si aún no agenda nada, un calendario vacío
      return new Response(cuerpo, { headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="mty-movida.ics"',
        'cache-control': 'public, max-age=600',
        'access-control-allow-origin': '*',
      } });
    }
    const e = url.pathname.match(/^\/e\/([^/]+)\/?$/);
    if (e) return paginaEvento(decodeURIComponent(e[1]), env, url);
    return env.ASSETS.fetch(request);
  },
};

// Enlace propio de cada evento (mtymovida.com/e/<id>): muestra una vista previa con el nombre, la fecha y la foto
// del evento cuando se comparte por WhatsApp o redes, y de inmediato lleva a la ficha dentro de la página.
const PUBLICA = 'sb_publishable_LfR-ayNY5bpv2xlO8pkEXQ_sE4nP0BG';
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const escH = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function cuando(fecha, hora) {
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DIA[d.getUTCDay()]} ${+m[3]} ${MES[+m[2] - 1]}${hora ? ' · ' + String(hora).slice(0, 5) + ' h' : ''}`;
}
async function paginaEvento(id, env, url) {
  let ev = null;
  try {
    if (/^db-[0-9a-f-]{36}$/i.test(id)) {
      const r = await fetch(`${SUPABASE}/rest/v1/eventos_enviados?id=eq.${id.slice(3)}&estado=eq.aprobado&select=datos,foto`, { headers: { apikey: PUBLICA, authorization: `Bearer ${PUBLICA}` } });
      const f = r.ok ? (await r.json())[0] : null;
      if (f) { const d = f.datos || {}; ev = { t: d.nombre, fecha: d.fecha, h: d.hora, lugar: d.lugar, desc: d.descripcion, img: f.foto }; }
    } else {
      const r = await env.ASSETS.fetch(new Request(new URL('/data/eventos-fijos.json', url)));
      if (r.ok) ev = (await r.json())[id] || null;
    }
  } catch (x) { ev = null; }
  const titulo = ev ? `${ev.t} · Mty Movida` : 'Mty Movida · La agenda cultural de Monterrey';
  const linea = ev ? [cuando(ev.fecha, ev.h), ev.lugar].filter(Boolean).join(' · ') : '';
  const desc = ev ? [linea, String(ev.desc || '').slice(0, 160)].filter(Boolean).join('. ') : 'Eventos, planes para hoy, festivales y atracciones de Monterrey.';
  const img = ev && /^https?:\/\//.test(ev.img || '') ? ev.img : 'https://mtymovida.com/img/compartir.jpg';
  const destino = `/evento/${encodeURIComponent(id)}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escH(titulo)}</title><meta name="description" content="${escH(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Mty Movida"><meta property="og:locale" content="es_MX">
<meta property="og:url" content="https://mtymovida.com/e/${escH(encodeURIComponent(id))}"><meta property="og:title" content="${escH(ev ? ev.t : 'Mty Movida')}">
<meta property="og:description" content="${escH(desc)}"><meta property="og:image" content="${escH(img)}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${escH(destino)}"><link rel="canonical" href="https://mtymovida.com/e/${escH(encodeURIComponent(id))}">
<style>body{font-family:Arial,sans-serif;background:#F7F3F2;color:#1E1714;display:grid;place-items:center;min-height:90vh}</style></head>
<body><p>Abriendo <a href="${escH(destino)}">${escH(ev ? ev.t : 'Mty Movida')}</a>…</p><script>location.replace(${JSON.stringify(destino)})</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
