// Sondeo: revisa si una lista de páginas se puede leer desde GitHub y si publica eventos en un formato legible.
const AGENTE = 'MtyMovidaBot/1.0 (+agenda cultural de Monterrey)';
const URLS = (process.env.URLS || '').split(/\s+/).filter(Boolean);
async function traer(u) { try { const r = await fetch(u, { headers: { 'user-agent': AGENTE, accept: 'text/html,application/xml,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(20000) }); return { s: r.status, t: r.ok ? await r.text() : '' , u: r.url }; } catch (e) { return { s: String(e.name || e), t: '' }; } }
function ld(h) { let n = 0; const ej = []; for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const st = [].concat(JSON.parse(m[1].trim())); while (st.length) { const x = st.pop(); if (!x || typeof x !== 'object') continue; if (Array.isArray(x['@graph'])) st.push(...x['@graph']); if (x.itemListElement) st.push(...[].concat(x.itemListElement).map(i => i.item || i)); if (/Event/.test([].concat(x['@type']).join(' ')) && x.startDate) { n++; if (ej.length < 2) ej.push(`${x.name} ${x.startDate}`); } } } catch {} } return { n, ej }; }
for (const u of URLS) {
  const r = await traer(u), o = new URL(u).origin;
  const l = ld(r.t);
  const tribe = await traer(o + '/wp-json/tribe/events/v1/events?per_page=3');
  let tn = 0; try { tn = JSON.parse(tribe.t).events.length; } catch {}
  const wp = /wp-content/.test(r.t);
  const next = /__NEXT_DATA__/.test(r.t), nuxt = /__NUXT__/.test(r.t);
  const evlinks = new Set([...r.t.matchAll(/href="([^"]*(?:evento|event|agenda|actividad|e\/)[^"]*)"/gi)].map(m => m[1])).size;
  console.log(`::notice::${u} → ${r.s} · ${r.t.length} bytes · JSON-LD eventos: ${l.n}${l.ej.length ? ' (' + l.ej.join(' | ') + ')' : ''} · TribeAPI: ${tribe.s}/${tn} · WP:${wp} NEXT:${next} NUXT:${nuxt} · enlaces evento: ${evlinks} · final: ${r.u || ''}`.slice(0, 900));
}
