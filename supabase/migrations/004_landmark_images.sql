-- Main cover image + gallery array for each landmark.
-- images JSON shape: [{ "url": "https://...", "alt": "optional caption" }]

alter table public.locations add column if not exists image_url text;
alter table public.locations add column if not exists images jsonb not null default '[]'::jsonb;
