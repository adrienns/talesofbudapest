-- Era taxonomy column for kg_claims (VECTOR_DB_IMPROVEMENTS.md technique #3).
--
-- Era boundaries are config, not schema: they live in
-- talesofbudapest-backend/lib/kgEras.js, not in a check constraint here. A
-- constraint would turn every future boundary tweak into a migration; a
-- plain text column lets the config evolve independently, at the cost of
-- trusting the application (kgPromotion.js) to stamp valid ids.
alter table public.kg_claims add column if not exists era text;

create index if not exists kg_claims_era_idx
  on public.kg_claims (era, review_status);

-- One-time backfill for pre-existing rows. This CASE expression must mirror
-- lib/kgEras.js ERAS exactly -- if you change the ranges there, update this
-- comment's sibling statement next time you write a migration, but do not
-- edit this already-applied statement.
update public.kg_claims
set era = case
  when coalesce(start_year, end_year) is null then null
  when coalesce(start_year, end_year) < 1825 then 'early'
  when coalesce(start_year, end_year) between 1825 and 1848 then 'reform_era'
  when coalesce(start_year, end_year) between 1849 and 1866 then 'absolutism'
  when coalesce(start_year, end_year) between 1867 and 1913 then 'dualism'
  when coalesce(start_year, end_year) between 1914 and 1918 then 'wwi'
  when coalesce(start_year, end_year) between 1919 and 1938 then 'interwar'
  when coalesce(start_year, end_year) between 1939 and 1945 then 'wwii_holocaust'
  when coalesce(start_year, end_year) between 1946 and 1989 then 'state_socialism'
  else 'contemporary'
end
where era is null;
