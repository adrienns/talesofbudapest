/** Held-out gold provenance helpers for human + Sol silver certification. */

export const isHumanSource = (value) => String(value ?? '').startsWith('human');
export const isSolSource = (value) => String(value ?? '').startsWith('sol');
export const isAdjudicatedSource = (value) => isHumanSource(value) || isSolSource(value);

export const certificationForSources = (sources) => {
  const list = [...sources].filter(Boolean);
  const human = list.some(isHumanSource);
  const sol = list.some(isSolSource);
  if (human && sol) return 'mixed';
  if (human) return 'human';
  if (sol) return 'sol_silver';
  return null;
};
