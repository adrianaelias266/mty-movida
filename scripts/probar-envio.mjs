// Prueba el formulario «Agrega tu evento» igual que la página: sube un cartel y crea la solicitud
// con la llave pública. Al final borra lo que creó con la llave secreta.
const SB_URL = 'https://aqakoihxgwxdyrtzjrfh.supabase.co';
const PUB = 'sb_publishable_LfR-ayNY5bpv2xlO8pkEXQ_sE4nP0BG';
const SEC = process.env.SUPABASE_SECRET;
const hp = { apikey: PUB, authorization: `Bearer ${PUB}` };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const path = `prueba/${Date.now()}.png`;
let r = await fetch(`${SB_URL}/storage/v1/object/carteles/${path}`, { method: 'POST', headers: { ...hp, 'content-type': 'image/png' }, body: png });
console.log(`::notice::Subir cartel: ${r.status} ${(await r.text()).slice(0, 300)}`);
const datos = { nombre: 'PRUEBA AUTOMÁTICA — borrar', organizador: 'Prueba', correo: 'prueba@example.com', categoria: 'concierto', municipio: 'centro', fecha: '2026-12-01', hora: '20:00', descripcion: 'Prueba del formulario' };
r = await fetch(`${SB_URL}/rest/v1/eventos_enviados`, { method: 'POST', headers: { ...hp, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify({ datos, foto: `${SB_URL}/storage/v1/object/public/carteles/${path}` }) });
console.log(`::notice::Crear solicitud: ${r.status} ${(await r.text()).slice(0, 300)}`);
if (SEC) {
  const hs = { apikey: SEC, authorization: `Bearer ${SEC}` };
  const d = await fetch(`${SB_URL}/rest/v1/eventos_enviados?datos->>nombre=eq.${encodeURIComponent(datos.nombre)}`, { method: 'DELETE', headers: { ...hs, prefer: 'return=representation' } });
  console.log(`::notice::Borrar solicitud de prueba: ${d.status} ${(await d.text()).length} bytes`);
  const s = await fetch(`${SB_URL}/storage/v1/object/carteles`, { method: 'DELETE', headers: { ...hs, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
  console.log(`::notice::Borrar cartel de prueba: ${s.status}`);
}
