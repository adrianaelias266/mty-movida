// Lee páginas oficiales y muestra el texto visible para confirmar fechas, horarios y costos.
const AGENTE = 'Mozilla/5.0 (MtyMovidaBot/1.0; agenda cultural de Monterrey)';
const URLS = (process.env.URLS || '').split(/\s+/).filter(Boolean);
const limpiar = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ');
for (const u of URLS) {
  try {
    const r = await fetch(u, { headers: { 'user-agent': AGENTE }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    const h = await r.text();
    const ld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].replace(/\s+/g, ' ').slice(0, 900));
    const t = limpiar(h);
    const i = Math.max(0, t.search(/noviembre|nov\b|gratu|gratis|costo|horario/i) - 400);
    console.log(`\n===== ${u} → ${r.status}\nLD: ${ld.join(' || ').slice(0, 1500)}\nTEXTO: ${t.slice(i, i + 2200)}`);
  } catch (e) { console.log(`\n===== ${u} → error ${e.name}`); }
}
