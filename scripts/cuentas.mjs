// Cuenta cuántas personas tienen cuenta en Mty Movida. Solo imprime números, nunca correos ni nombres.
const SB_URL = process.env.SUPABASE_URL || 'https://aqakoihxgwxdyrtzjrfh.supabase.co';
const KEY = process.env.SUPABASE_SECRET;
if (!KEY) { console.log('::error::Falta la llave secreta'); process.exit(1); }
const h = { apikey: KEY, authorization: `Bearer ${KEY}` };
let todos = [], page = 1;
for (;;) {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: h });
  if (!r.ok) { console.log(`::error::No se pudo leer: ${r.status}`); process.exit(1); }
  const j = await r.json(); const u = j.users || [];
  todos = todos.concat(u); if (u.length < 1000) break; page++;
}
const ahora = Date.now(), dias = n => ahora - n * 864e5;
const t = x => x ? Date.parse(x) : 0;
console.log(`::notice::Cuentas en total: ${todos.length}`);
console.log(`::notice::Confirmaron su correo: ${todos.filter(u => u.email_confirmed_at || u.confirmed_at).length}`);
console.log(`::notice::Creadas en los últimos 7 días: ${todos.filter(u => t(u.created_at) > dias(7)).length}`);
console.log(`::notice::Entraron en los últimos 7 días: ${todos.filter(u => t(u.last_sign_in_at) > dias(7)).length}`);
const p = await fetch(`${SB_URL}/rest/v1/perfiles?select=id`, { headers: { ...h, prefer: 'count=exact', range: '0-0' } });
console.log(`::notice::Perfiles creados: ${(p.headers.get('content-range') || '').split('/')[1] || '?'}`);
