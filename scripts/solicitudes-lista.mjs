// Lista (sin correos) los eventos que mandaron las personas desde el formulario.
const SB_URL = 'https://aqakoihxgwxdyrtzjrfh.supabase.co', SEC = process.env.SUPABASE_SECRET;
const h = { apikey: SEC, authorization: `Bearer ${SEC}` };
const r = await fetch(`${SB_URL}/rest/v1/eventos_enviados?or=(fuente.is.null,fuente.eq.Organizador)&select=id,estado,creado,datos,foto&order=creado.desc&limit=60&datos->>nombre=ilike.*CINECLUB*`, { headers: h });
if (!r.ok) { console.log(`::error::${r.status} ${await r.text()}`); process.exit(1); }
for (const x of await r.json()) { const d = x.datos || {};
  console.log(`::notice::${x.estado} | ${d.fecha} ${d.hora || ''} | ${d.nombre} | ${d.categoria} | ${d.lugar || ''} | precio ${d.precio ?? '?'} | org ${d.organizador || ''} | foto ${x.foto ? 'sí' : 'no'} | enlace ${d.enlace || ''} | ${String(d.descripcion || '').slice(0, 400).replace(/\s+/g, ' ')}`); }
