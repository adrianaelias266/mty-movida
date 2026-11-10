// Da de alta un correo como administradora de Mty Movida (tabla «administradoras»).
const SB_URL = 'https://aqakoihxgwxdyrtzjrfh.supabase.co', SEC = process.env.SUPABASE_SECRET;
const correo = String(process.env.CORREO || '').trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(correo)) { console.log('::error::Correo inválido'); process.exit(1); }
const h = { apikey: SEC, authorization: `Bearer ${SEC}`, 'content-type': 'application/json' };
const r = await fetch(`${SB_URL}/rest/v1/administradoras`, { method: 'POST', headers: { ...h, prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ correo }) });
console.log(`::notice::Alta de administradora: ${r.status} ${(await r.text()).slice(0, 200)}`);
const l = await fetch(`${SB_URL}/rest/v1/administradoras?select=correo`, { headers: h });
console.log(`::notice::Administradoras registradas: ${(await l.json()).length}`);
