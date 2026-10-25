-- ============================================================
-- Mty Movida · Paso 2: eventos automáticos y aprobación
-- Copia TODO, pégalo en Supabase › SQL Editor y toca "Run".
-- ============================================================

-- De dónde viene cada evento, para no guardar el mismo dos veces
alter table public.eventos_enviados add column if not exists fuente     text not null default 'Organizador';
alter table public.eventos_enviados add column if not exists fuente_url text;
create unique index if not exists eventos_enviados_fuente_url on public.eventos_enviados (fuente_url);

-- La página muestra a todo el mundo los eventos que tú apruebes
create policy "ver eventos aprobados" on public.eventos_enviados
  for select to anon, authenticated using (estado = 'aprobado');

-- Vista para revisar los pendientes más cómodo en el Table Editor
create or replace view public.por_revisar as
  select id, fuente, datos->>'nombre' as nombre, datos->>'fecha' as fecha, datos->>'hora' as hora,
         datos->>'lugar' as lugar, datos->>'categoria' as categoria, datos->>'enlace' as enlace, foto, estado, creado
  from public.eventos_enviados
  where estado = 'pendiente'
  order by datos->>'fecha';
revoke all on public.por_revisar from anon, authenticated;
