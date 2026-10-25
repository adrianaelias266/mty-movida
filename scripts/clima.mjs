// Descarga el pronóstico de Monterrey (Open-Meteo, gratuito y sin registro)
// y lo guarda en data/clima.json con el formato que lee la página:
// { updated: "fecha ISO", days: { "AAAA-MM-DD": [máxima, mínima, % de lluvia] } }
import { writeFile, mkdir } from 'node:fs/promises';

const url = 'https://api.open-meteo.com/v1/forecast'
  + '?latitude=25.6714&longitude=-100.3089'
  + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  + '&timezone=America%2FMonterrey&forecast_days=16';

const res = await fetch(url);
if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
const { daily } = await res.json();

const days = {};
daily.time.forEach((date, i) => {
  days[date] = [
    Math.round(daily.temperature_2m_max[i] * 10) / 10,
    Math.round(daily.temperature_2m_min[i] * 10) / 10,
    daily.precipitation_probability_max[i] ?? 0,
  ];
});

await mkdir('data', { recursive: true });
await writeFile('data/clima.json', JSON.stringify({ updated: new Date().toISOString(), days }, null, 1) + '\n');
console.log(`Clima guardado: ${Object.keys(days).length} días`);
