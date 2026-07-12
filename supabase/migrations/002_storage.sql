insert into storage.buckets (id, name, public)
values ('audio-tours', 'audio-tours', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read audio tours" on storage.objects;

create policy "Public read audio tours"
  on storage.objects for select
  using (bucket_id = 'audio-tours');

drop policy if exists "Service upload audio tours" on storage.objects;

create policy "Service upload audio tours"
  on storage.objects for insert
  with check (bucket_id = 'audio-tours');

drop policy if exists "Service update audio tours" on storage.objects;

create policy "Service update audio tours"
  on storage.objects for update
  using (bucket_id = 'audio-tours');
