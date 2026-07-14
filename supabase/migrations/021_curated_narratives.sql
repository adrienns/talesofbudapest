-- Stable identities for editorially curated, bilingual tours.
alter table public.narratives
  add column if not exists curated_slug text,
  add column if not exists content_version integer,
  add column if not exists locale text check (locale in ('en', 'hu'));

create unique index if not exists narratives_curated_identity_idx
  on public.narratives (curated_slug, content_version, locale)
  where curated_slug is not null;

create unique index if not exists narrative_chapters_order_idx
  on public.narrative_chapters (narrative_id, chapter_index);

