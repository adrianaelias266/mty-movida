// Guarda copias de páginas en la carpeta sondeo/ para revisarlas (herramienta de apoyo, no la usa la página).
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('sondeo', { recursive: true });
const AGENTE = 'MtyMovidaBot/1.0 (+agenda cultural de Monterrey)';
for (const [i, u] of (process.env.URLS || '').split(/\s+/).filter(Boolean).entries()) {
  try { const r = await fetch(u, { headers: { 'user-agent': AGENTE } }); writeFileSync(`sondeo/p${i}.txt`, `${u}\n${r.status}\n` + await r.text()); }
  catch (e) { writeFileSync(`sondeo/p${i}.txt`, `${u}\nERROR ${e}`); }
}
