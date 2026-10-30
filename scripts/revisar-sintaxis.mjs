// Revisa que el código de la página no tenga errores de escritura antes de publicar (si falla, la página se quedaría en blanco).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const html = readFileSync('public/index.html', 'utf8');
const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const dir = mkdtempSync(join(tmpdir(), 'revisar-'));
let mal = 0;
bloques.forEach((c, i) => { const f = join(dir, `b${i}.js`); writeFileSync(f, c);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { mal++; console.error(`Error en el bloque ${i + 1} de la página:\n${String(e.stderr).split('\n').slice(0, 6).join('\n')}`); } });
for (const f of ['worker.js', 'scripts/eventos.mjs', 'scripts/festivales.mjs']) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { mal++; console.error(`Error en ${f}:\n${String(e.stderr).split('\n').slice(0, 6).join('\n')}`); } }
if (mal) { console.error(`\n${mal} archivo(s) con errores: no se publica.`); process.exit(1); }
console.log(`Revisión correcta: ${bloques.length} bloques de la página y los scripts no tienen errores.`);
