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
    return env.ASSETS.fetch(request);
  },
};
