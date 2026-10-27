-- Calendarios para Google, Outlook y iPhone. Se pega una sola vez en Supabase: SQL Editor → New query → Run.
insert into storage.buckets (id, name, public) values ('calendarios', 'calendarios', true) on conflict (id) do nothing;
drop policy if exists "Cada quien sube su calendario" on storage.objects;
create policy "Cada quien sube su calendario" on storage.objects for insert to authenticated
  with check (bucket_id = 'calendarios' and name = auth.uid()::text || '.ics');
drop policy if exists "Cada quien cambia su calendario" on storage.objects;
create policy "Cada quien cambia su calendario" on storage.objects for update to authenticated
  using (bucket_id = 'calendarios' and name = auth.uid()::text || '.ics')
  with check (bucket_id = 'calendarios' and name = auth.uid()::text || '.ics');
drop policy if exists "Cada quien ve su calendario" on storage.objects;
create policy "Cada quien ve su calendario" on storage.objects for select to authenticated
  using (bucket_id = 'calendarios' and name = auth.uid()::text || '.ics');
