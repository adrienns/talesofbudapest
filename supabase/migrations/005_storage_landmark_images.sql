insert into storage.buckets (id, name, public)
values ('landmark-images', 'landmark-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read landmark images" on storage.objects;

create policy "Public read landmark images"
  on storage.objects for select
  using (bucket_id = 'landmark-images');

drop policy if exists "Service upload landmark images" on storage.objects;

create policy "Service upload landmark images"
  on storage.objects for insert
  with check (bucket_id = 'landmark-images');

drop policy if exists "Service update landmark images" on storage.objects;

create policy "Service update landmark images"
  on storage.objects for update
  using (bucket_id = 'landmark-images');
