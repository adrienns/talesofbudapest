import { TOUR_EN } from './how-budapest-became-budapest.en.js';
import { TOUR_HU } from './how-budapest-became-budapest.hu.js';

export const CURATED_TOURS = [TOUR_EN, TOUR_HU];

export const findCuratedTour = (slug, locale) =>
  CURATED_TOURS.find((tour) => tour.slug === slug && tour.locale === locale) ?? null;

const wordCount = (value) => value.trim().split(/\s+/u).filter(Boolean).length;

export const validateCuratedTours = (tours = CURATED_TOURS) => {
  const errors = [];
  const groups = new Map();

  for (const tour of tours) {
    const identity = `${tour.slug}:v${tour.version}`;
    const siblings = groups.get(identity) ?? [];
    siblings.push(tour);
    groups.set(identity, siblings);

    if (!['en', 'hu'].includes(tour.locale)) errors.push(`${identity}: invalid locale ${tour.locale}`);
    if (tour.stops.length !== 9) errors.push(`${identity}:${tour.locale}: expected exactly 9 stops`);
    if (!tour.walkingRoute?.geometry || tour.walkingRoute.geometry.length < tour.stops.length) {
      errors.push(`${identity}:${tour.locale}: walking geometry is incomplete`);
    }
    if (tour.walkingRoute?.distanceMeters < 4000 || tour.walkingRoute?.distanceMeters > 5000) {
      errors.push(`${identity}:${tour.locale}: distance must remain near 4.4 km`);
    }

    const keys = new Set();
    for (const item of tour.stops) {
      if (keys.has(item.key)) errors.push(`${identity}:${tour.locale}: duplicate stop ${item.key}`);
      keys.add(item.key);
      if (item.lat < 47.45 || item.lat > 47.55 || item.lng < 19.0 || item.lng > 19.15) {
        errors.push(`${identity}:${tour.locale}:${item.key}: coordinates are outside central Budapest`);
      }
      const minimum = item.key === 'shoes-danube' ? 280 : 300;
      const count = wordCount(item.script);
      if (count < minimum || count > 800) {
        errors.push(`${identity}:${tour.locale}:${item.key}: script has ${count} words`);
      }
      if (!item.sourceIds?.length) errors.push(`${identity}:${tour.locale}:${item.key}: no source IDs`);
    }
  }

  for (const [identity, siblings] of groups) {
    const locales = new Set(siblings.map((tour) => tour.locale));
    if (!locales.has('en') || !locales.has('hu')) errors.push(`${identity}: both en and hu are required`);
    if (siblings.length === 2) {
      const [first, second] = siblings;
      first.stops.forEach((item, index) => {
        const peer = second.stops[index];
        if (!peer || peer.key !== item.key) errors.push(`${identity}: locale stop order differs at ${index}`);
        if (peer && JSON.stringify(peer.sourceIds) !== JSON.stringify(item.sourceIds)) {
          errors.push(`${identity}:${item.key}: source IDs differ by locale`);
        }
      });
    }
  }

  if (errors.length) throw new Error(`Invalid curated tour content:\n- ${errors.join('\n- ')}`);
  return true;
};
