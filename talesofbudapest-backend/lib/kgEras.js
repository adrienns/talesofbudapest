// Era taxonomy for Budapest history (VECTOR_DB_IMPROVEMENTS.md technique #3).
//
// Boundaries are config, not schema: this file is the single source of
// truth. supabase/migrations/017_kg_claim_era.sql only stores the derived
// `era` id and must mirror the ranges below by hand -- there is no DB check
// constraint enforcing it, on purpose, so a boundary tweak here never
// requires a migration.
//
// Ranges are inclusive on both ends and contiguous: every integer year maps
// to exactly one era, with the first and last eras open-ended so no year is
// ever unmapped.
export const ERAS = [
  { id: 'early', label_en: 'Before the Reform Era', label_hu: 'Reformkor előtt', startYear: null, endYear: 1824 },
  { id: 'reform_era', label_en: 'Reform Era', label_hu: 'Reformkor', startYear: 1825, endYear: 1848 },
  { id: 'absolutism', label_en: 'Revolution & Absolutism', label_hu: 'Forradalom és önkényuralom', startYear: 1849, endYear: 1866 },
  { id: 'dualism', label_en: 'Golden Age / Dualism', label_hu: 'Aranykor / Kiegyezés kora', startYear: 1867, endYear: 1913 },
  { id: 'wwi', label_en: 'World War I', label_hu: 'Első világháború', startYear: 1914, endYear: 1918 },
  { id: 'interwar', label_en: 'Interwar Period', label_hu: 'Két világháború közötti időszak', startYear: 1919, endYear: 1938 },
  { id: 'wwii_holocaust', label_en: 'World War II & the Holocaust', label_hu: 'Második világháború és a holokauszt', startYear: 1939, endYear: 1945 },
  { id: 'state_socialism', label_en: 'State Socialism', label_hu: 'Államszocializmus', startYear: 1946, endYear: 1989 },
  { id: 'contemporary', label_en: 'Post-1989 / Contemporary', label_hu: 'Rendszerváltás utáni kor', startYear: 1990, endYear: null },
];

const withinEra = (era, year) =>
  (era.startYear === null || year >= era.startYear) && (era.endYear === null || year <= era.endYear);

// Prefer startYear; fall back to endYear; both null -> null. A year that
// falls outside every explicit range clamps to the nearest open-ended edge
// era (there always is one, since ERAS[0].startYear and
// ERAS.at(-1).endYear are both null).
export const eraForYears = (startYear, endYear) => {
  const year = startYear ?? endYear;
  if (year === null || year === undefined) return null;
  const match = ERAS.find((era) => withinEra(era, year));
  if (match) return match.id;
  return year < ERAS[0].endYear ? ERAS[0].id : ERAS.at(-1).id;
};

// All era ids a [startYear, endYear] range overlaps, in chronological order.
// A claim spanning 1860-1875 touches both 'absolutism' and 'dualism'; the
// primary era for filtering/display is eraForYears, but the full list is
// useful for "does this era's filter match any part of this claim" queries.
export const erasForRange = (startYear, endYear) => {
  const start = startYear ?? endYear;
  const end = endYear ?? startYear;
  if (start === null || start === undefined || end === null || end === undefined) return [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return ERAS.filter((era) => (era.startYear === null || era.startYear <= hi) && (era.endYear === null || era.endYear >= lo))
    .map((era) => era.id);
};

export const eraLabel = (id, locale = 'en') => {
  const era = ERAS.find((candidate) => candidate.id === id);
  if (!era) return null;
  return locale === 'hu' ? era.label_hu : era.label_en;
};
