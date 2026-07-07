const BUDAPEST_BOUNDS = {
  minLat: 47.38,
  maxLat: 47.58,
  minLng: 18.98,
  maxLng: 19.18,
};

const DANUBE_LNG_THRESHOLD = 19.05;

export const buildContextualSuggestions = (context = {}) => {
  const hour = context.hour ?? new Date().getHours();
  const userLat = context.userLat ?? null;
  const userLng = context.userLng ?? null;

  const isEvening = hour >= 18 || hour < 6;
  const nearDanube =
    userLng !== null &&
    userLng >= DANUBE_LNG_THRESHOLD - 0.02 &&
    userLng <= DANUBE_LNG_THRESHOLD + 0.02;

  const suggestions = [];

  if (nearDanube) {
    suggestions.push('Espionage along the Danube');
  }

  if (isEvening) {
    suggestions.push('Jewish Quarter');
  }

  suggestions.push('Quick 15-min highlights');
  suggestions.push('Medieval stories');

  if (!nearDanube) {
    suggestions.push('Espionage along the Danube');
  }

  if (!isEvening) {
    suggestions.push('Secrets of the riverside at dusk');
  }

  return [...new Set(suggestions)].slice(0, 4);
};

export { BUDAPEST_BOUNDS };
