# Mty Movida

Agenda cultural de la zona metropolitana de Monterrey.

## Cómo está organizado

- `public/`: el sitio que se publica (página, fotos y datos).
- `public/data/clima.json`: pronóstico de 16 días por municipio. Se actualiza solo cada mañana.
- `scripts/clima.mjs`: descarga el pronóstico de Open-Meteo.
- `scripts/eventos.mjs` y `scripts/fuentes.mjs`: recolector que revisa cada noche los sitios de las fuentes y manda los eventos nuevos a revisión.
- `supabase/`: instrucciones de la base de datos.
- `.github/workflows/`: tareas automáticas de GitHub.

## Tareas automáticas

| Tarea | Cuándo | Qué hace |
|---|---|---|
| Actualizar clima | Todos los días, 5:17 a. m. | Guarda el pronóstico y la página se vuelve a publicar sola |
| Buscar eventos nuevos | Todos los días, 1:43 a. m. | Manda los eventos encontrados a la lista de pendientes en Supabase |

Para correr una a mano: pestaña **Actions** → elige la tarea → **Run workflow**.

## Aprobar eventos

En Supabase → **Table Editor** → **eventos_enviados**, cambia la columna `estado` de `pendiente` a `aprobado`. El evento aparece en la página la próxima vez que alguien la abra.

Los eventos que ya pasaron se ocultan solos según su fecha y quedan como "eventos pasados" de su organizador.

## Agregar una fuente

Edita `scripts/fuentes.mjs` y agrega un bloque con el nombre, la dirección del sitio y la palabra que tienen las direcciones de sus eventos. El recolector solo puede leer sitios que publican sus eventos con datos de tipo schema.org/Event; en la pestaña Actions se ve cuántos eventos encontró en cada fuente.
