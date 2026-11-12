// Lee las actividades vigentes de LABNL desde su API oficial y muestra fechas y el texto completo.
const r = await fetch('https://www.labnuevoleon.mx/payload/activities?sort=-startDate&limit=40&depth=1&where[_status][equals]=published&where[type][equals]=activity');
const d = await r.json();
const texto = x => JSON.stringify(x).match(/"text":"([^"]*)"/g)?.map(s => s.slice(8, -1)).join(' ') || '';
for (const e of d.docs || []) {
  if ((e.endDate || e.startDate) < '2026-11-12') continue;
  console.log(`\n===== ${e.slug} | ${e.title} | inicio ${e.startDate} | fin ${e.endDate}`);
  const t = Object.entries(e).filter(([k]) => !/image|meta|seo/i.test(k)).map(([k, v]) => typeof v === 'string' ? `${k}: ${v}` : `${k}: ${texto(v)}`).filter(s => s.length > 4 && !/^\w+: $/.test(s)).join('\n');
  console.log(t.slice(0, 2500));
}
