// Fotos a nivel de calle de Mapillary (licencia CC BY-SA 4.0) para atracciones sin foto.
// Busca fotos tomadas a 15–90 m del lugar y mirando hacia él; descarga la mejor y guarda su crédito.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const TOKEN = process.env.MAPILLARY_TOKEN;
if (!TOKEN) { console.log('::error::Falta la llave MAPILLARY_TOKEN'); process.exit(1); }
const LUGARES = {
  vidrio: [25.6899934, -100.3081915], autos: [25.7150915, -100.3158693], ciencias: [25.6822798, -100.2952082],
  milarca: [25.6443734, -100.3273327], antiguosmex: [25.6646024, -100.4017484], museoguadalupe: [25.67732, -100.2599706],
  museoapodaca: [25.7802152, -100.1850658], museoescobedo: [25.8083433, -100.3229835], blanqueo: [25.6659738, -100.4411775],
  museosantiago: [25.4246587, -100.1512378], pilon: [25.1930706, -99.8182496], memoriaviva: [26.5360244, -100.505052],
  cosassimples: [26.5345431, -100.5007709], bernabe: [26.0010417, -100.5272121],
};
const rad = x => x * Math.PI / 180;
const dist = (a, b) => { const R = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const rumbo = (a, b) => { const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
const ARCHIVO = 'public/data/fotos-mapillary.json';
const salida = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : {};
for (const [id, p] of Object.entries(LUGARES)) {
  if (salida[id]) continue;
  const d = 0.0012; // unos 130 m alrededor
  const u = `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,thumb_1024_url,creator,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,is_pano&bbox=${p[1] - d},${p[0] - d},${p[1] + d},${p[0] + d}&limit=200`;
  const r = await fetch(u); if (!r.ok) { console.log(`::warning::${id}: Mapillary respondió ${r.status}`); continue; }
  const lista = (await r.json()).data || [];
  const opciones = lista.filter(x => !x.is_pano && x.thumb_1024_url).map(x => {
    const g = (x.computed_geometry || x.geometry).coordinates, pos = [g[1], g[0]];
    const m = dist(pos, p), giro = Math.abs((((x.computed_compass_angle ?? x.compass_angle) - rumbo(pos, p)) + 540) % 360 - 180);
    const anios = (Date.now() - (x.captured_at || 0)) / 3.15e10;
    return { x, m, giro, puntos: giro + Math.abs(m - 40) * 0.6 + anios * 4 };
  }).filter(o => o.m >= 12 && o.m <= 90 && o.giro <= 35).sort((a, b) => a.puntos - b.puntos);
  const mejor = opciones[0];
  if (!mejor) { console.log(`::notice::${id}: sin foto que mire hacia el lugar (${lista.length} fotos cerca)`); continue; }
  const img = await fetch(mejor.x.thumb_1024_url); if (!img.ok) continue;
  writeFileSync(`public/img/atr/${id}.jpg`, Buffer.from(await img.arrayBuffer()));
  salida[id] = { foto: `img/atr/${id}.jpg`, credito: { autor: mejor.x.creator?.username || 'Comunidad de Mapillary', licencia: 'CC BY-SA 4.0', url: `https://www.mapillary.com/app/?pKey=${mejor.x.id}`, fuente: 'Mapillary' },
    metros: Math.round(mejor.m), fecha: new Date(mejor.x.captured_at).toISOString().slice(0, 10) };
  console.log(`::notice::${id}: foto a ${Math.round(mejor.m)} m, tomada el ${salida[id].fecha}`);
}
writeFileSync(ARCHIVO, JSON.stringify(salida, null, 1));
