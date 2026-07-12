alter table public.locations add column if not exists importance_tier text;
alter table public.locations add column if not exists importance_score integer;

create index if not exists locations_importance_tier_idx
  on public.locations (importance_tier);

update public.locations
set
  importance_tier = 'featured',
  importance_score = coalesce(importance_score, 100)
where source in ('wikipedia', 'iconic')
  and importance_tier is null;

update public.locations
set
  importance_tier = 'standard',
  importance_score = coalesce(importance_score, 50)
where source = 'muemlekem'
  and importance_tier is null;

update public.locations
set
  importance_tier = 'archive',
  importance_score = coalesce(importance_score, 20)
where source = 'budapest100'
  and importance_tier is null;

update public.locations
set
  importance_tier = 'archive',
  importance_score = coalesce(importance_score, 20)
where importance_tier is null;
