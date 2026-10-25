// Descarga el pronóstico de 16 días (Open-Meteo, gratuito y sin registro) para cada
// municipio y lo guarda en public/data/clima.json con el formato que lee la página:
// { updated, days: {fecha: [máx, mín, % lluvia]}, zonas: { centro: {fecha: [...]}, ... } }
import { writeFile, mkdir } from 'node:fs/promises';

const ZONAS = {
  centro: [25.6714, -100.3089], sanpedro: [25.6573, -100.4026], sannicolas: [25.7417, -100.3022],
  guadalupe: [25.6775, -100.2597], apodaca: [25.7818, -100.1884], escobedo: [25.7969, -100.3256],
  santacatarina: [25.6733, -100.4583], garcia: [25.8136, -100.5867], juarez: [25.6464, -100.0956],
  santiago: [25.4250, -100.1520],
};

const url = 'https://api.open-meteo.com/v1/forecast'
  + '?latitude=' + Object.values(ZONAS).map(z => z[0]).join(',')
  + '&longitude=' + Object.values(ZONAS).map(z => z[1]).join(',')
  + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  + '&timezone=America%2FMonterrey&forecast_days=16';

const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
const lista = await res.json(); // con varias coordenadas responde una lista, en el mismo orden

const r1 = v => Math.round(v * 10) / 10;
const zonas = {};
Object.keys(ZONAS).forEach((z, i) => {
  const { daily } = lista[i];
  zonas[z] = {};
  daily.time.forEach((fecha, j) => {
    zonas[z][fecha] = [r1(daily.temperature_2m_max[j]), r1(daily.temperature_2m_min[j]), daily.precipitation_probability_max[j] ?? 0];
  });
});

await mkdir('public/data', { recursive: true });
await writeFile('public/data/clima.json', JSON.stringify({ updated: new Date().toISOString(), days: zonas.centro, zonas }) + '\n');
console.log(`Clima guardado para ${Object.keys(zonas).length} municipios, ${Object.keys(zonas.centro).length} días`);
