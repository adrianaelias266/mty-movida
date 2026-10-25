-- ============================================================
-- Mty Movida · Base de datos en Supabase
-- Copia TODO este texto, pégalo en Supabase › SQL Editor y toca "Run".
-- Se puede correr una sola vez.
-- ============================================================

-- 1) Perfil de cada persona: nombre, gustos y avisos
create table if not exists public.perfiles (
  id         uuid primary key references auth.users on delete cascade,
  nombre     text,
  gustos     text[]  not null default '{}',   -- tipos de evento que le gustan
  zonas      text[]  not null default '{}',   -- municipios donde suele salir
  horarios   text[]  not null default '{}',   -- mañana, tarde o noche
  listo      boolean not null default false,  -- ya eligió sus gustos
  avisos     jsonb   not null default '{"recordatorios": true, "semanal": false}',
  creado     timestamptz not null default now()
);

-- 2) Eventos que cada persona agendó (y si marcó "Voy")
create table if not exists public.agendados (
  usuario uuid not null default auth.uid() references auth.users on delete cascade,
  evento  text not null,
  voy     boolean not null default false,
  creado  timestamptz not null default now(),
  primary key (usuario, evento)
);

-- 3) Planes armados por cada persona
create table if not exists public.planes (
  id      uuid primary key default gen_random_uuid(),
  usuario uuid not null default auth.uid() references auth.users on delete cascade,
  nombre  text not null,
  eventos text[] not null default '{}',
  creado  timestamptz not null default now()
);

-- 4) Organizadores que sigue cada persona
create table if not exists public.seguidos (
  usuario     uuid not null default auth.uid() references auth.users on delete cascade,
  organizador text not null,
  creado      timestamptz not null default now(),
  primary key (usuario, organizador)
);

-- 5) Reseñas de eventos (las ve todo el mundo)
create table if not exists public.resenas (
  id           uuid primary key default gen_random_uuid(),
  usuario      uuid not null default auth.uid() references auth.users on delete cascade,
  evento       text not null,
  nombre       text not null,
  ambiente     int  not null check (ambiente between 1 and 5),
  organizacion int  not null check (organizacion between 1 and 5),
  precio       int  not null check (precio between 1 and 5),
  texto        text,
  creado       timestamptz not null default now(),
  unique (usuario, evento)
);

-- 6) Eventos que envían los organizadores para revisión
create table if not exists public.eventos_enviados (
  id      uuid primary key default gen_random_uuid(),
  datos   jsonb not null,
  foto    text,
  estado  text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado  timestamptz not null default now()
);

-- ============================================================
-- Seguridad: cada persona solo puede ver y cambiar lo suyo
-- ============================================================
alter table public.perfiles         enable row level security;
alter table public.agendados        enable row level security;
alter table public.planes           enable row level security;
alter table public.seguidos         enable row level security;
alter table public.resenas          enable row level security;
alter table public.eventos_enviados enable row level security;

create policy "perfil propio: ver"      on public.perfiles for select using (auth.uid() = id);
create policy "perfil propio: crear"    on public.perfiles for insert with check (auth.uid() = id);
create policy "perfil propio: cambiar"  on public.perfiles for update using (auth.uid() = id);

create policy "agendados propios"  on public.agendados for all using (auth.uid() = usuario) with check (auth.uid() = usuario);
create policy "planes propios"     on public.planes    for all using (auth.uid() = usuario) with check (auth.uid() = usuario);
create policy "seguidos propios"   on public.seguidos  for all using (auth.uid() = usuario) with check (auth.uid() = usuario);

create policy "reseñas: todos las ven"      on public.resenas for select using (true);
create policy "reseñas: escribir la propia" on public.resenas for insert with check (auth.uid() = usuario);
create policy "reseñas: cambiar la propia"  on public.resenas for update using (auth.uid() = usuario);
create policy "reseñas: borrar la propia"   on public.resenas for delete using (auth.uid() = usuario);

-- Cualquiera puede enviar un evento; solo tú (desde el panel de Supabase) los ves y apruebas
create policy "enviar evento" on public.eventos_enviados for insert to anon, authenticated with check (estado = 'pendiente');

-- ============================================================
-- Al crear una cuenta, se crea su perfil automáticamente
-- ============================================================
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_cuenta on auth.users;
create trigger al_crear_cuenta after insert on auth.users
  for each row execute function public.crear_perfil();

-- ============================================================
-- Carpeta para las fotos y carteles que suben los organizadores
-- ============================================================
insert into storage.buckets (id, name, public) values ('carteles', 'carteles', true)
  on conflict (id) do nothing;

create policy "subir carteles" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'carteles');
create policy "ver carteles" on storage.objects for select
  using (bucket_id = 'carteles');
