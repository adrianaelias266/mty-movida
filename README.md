# Mty Movida

Agenda cultural de la zona metropolitana de Monterrey.

## Cómo está organizado

- `index.html`: la página completa.
- `img/`: logo y fotos de los eventos.
- `data/clima.json`: pronóstico del clima. Se actualiza solo cada mañana.
- `scripts/clima.mjs`: descarga el pronóstico de Open-Meteo.
- `.github/workflows/clima.yml`: tarea automática de GitHub que corre el script todos los días.

## Publicación

La página se publica en Cloudflare Pages. Cada cambio que se guarda en este repositorio se publica solo en unos segundos.

Para actualizar el clima a mano: pestaña **Actions** → **Actualizar clima** → **Run workflow**.
