-- Permisos para la sección «Solicitudes» de Mty Movida.
-- Se pega una sola vez en Supabase: SQL Editor → New query → Run.

-- 1) Lista de administradoras (por correo con el que inician sesión en la página)
create table if not exists public.administradoras (correo text primary key);
alter table public.administradoras enable row level security;
insert into public.administradoras (correo) values ('adrianaelias266@gmail.com') on conflict do nothing;
-- Para agregar a Scarlet, quita los dos guiones de la siguiente línea y pon su correo:
-- insert into public.administradoras (correo) values ('correo-de-scarlet@ejemplo.com') on conflict do nothing;

-- 2) Función que dice si quien inició sesión es administradora
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradoras where lower(correo) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function public.es_admin() to anon, authenticated;

-- 3) Las administradoras pueden ver y revisar todas las solicitudes
drop policy if exists "Administradoras ven todas las solicitudes" on public.eventos_enviados;
create policy "Administradoras ven todas las solicitudes" on public.eventos_enviados
  for select to authenticated using (public.es_admin());
drop policy if exists "Administradoras revisan solicitudes" on public.eventos_enviados;
create policy "Administradoras revisan solicitudes" on public.eventos_enviados
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
