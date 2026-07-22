import { TOUR_EN } from './how-budapest-became-budapest.en.js';
import { TOUR_HU } from './how-budapest-became-budapest.hu.js';
import { JEWISH_QUARTER_TOUR_EN } from './jewish-quarter-and-ruin-bars.en.js';
import { COMMUNISM_COLD_WAR_TOUR_EN } from './communism-cold-war-history.en.js';

export const CURATED_TOURS = [
  TOUR_EN,
  TOUR_HU,
  JEWISH_QUARTER_TOUR_EN,
  COMMUNISM_COLD_WAR_TOUR_EN,
];

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
    const [minimumDistance, maximumDistance] = tour.walkingDistanceRangeMeters ?? [400, 10000];
    if (tour.walkingRoute?.distanceMeters < minimumDistance
      || tour.walkingRoute?.distanceMeters > maximumDistance) {
      errors.push(
        `${identity}:${tour.locale}: distance must be between ${minimumDistance} and ${maximumDistance} metres`,
      );
    }

    const keys = new Set();
    for (const item of tour.stops) {
      if (keys.has(item.key)) errors.push(`${identity}:${tour.locale}: duplicate stop ${item.key}`);
      keys.add(item.key);
      if (!item.locationSlug) errors.push(`${identity}:${tour.locale}:${item.key}: no locationSlug`);
      if (item.lat < 47.45 || item.lat > 47.55 || item.lng < 19.0 || item.lng > 19.15) {
        errors.push(`${identity}:${tour.locale}:${item.key}: coordinates are outside central Budapest`);
      }
      const minimum = tour.scriptWordRange?.[0] ?? (item.key === 'shoes-danube' ? 280 : 300);
      const maximum = tour.scriptWordRange?.[1] ?? 800;
      const count = wordCount(item.script);
      if (count < minimum || count > maximum) {
        errors.push(`${identity}:${tour.locale}:${item.key}: script has ${count} words`);
      }
      if (!item.sourceIds?.length) errors.push(`${identity}:${tour.locale}:${item.key}: no source IDs`);
      if (tour.audioDesign && !item.audioDirection) {
        errors.push(`${identity}:${tour.locale}:${item.key}: no audio direction`);
      }
      if (tour.audioDesign?.musicAsset && typeof item.audioDirection?.music?.enabled !== 'boolean') {
        errors.push(`${identity}:${tour.locale}:${item.key}: music direction must explicitly enable or disable the cue`);
      }
      if (tour.sources) {
        for (const sourceId of item.sourceIds ?? []) {
          if (!tour.sources[sourceId]) errors.push(`${identity}:${tour.locale}:${item.key}: unknown source ${sourceId}`);
        }
      }
    }
  }

  for (const [identity, siblings] of groups) {
    const locales = new Set(siblings.map((tour) => tour.locale));
    if (siblings.length === 2) {
      const [first, second] = siblings;
      first.stops.forEach((item, index) => {
        const peer = second.stops[index];
        if (!peer || peer.key !== item.key) errors.push(`${identity}: locale stop order differs at ${index}`);
        if (peer && peer.locationSlug !== item.locationSlug) {
          errors.push(`${identity}:${item.key}: locationSlug differs by locale`);
        }
        if (peer && JSON.stringify(peer.sourceIds) !== JSON.stringify(item.sourceIds)) {
          errors.push(`${identity}:${item.key}: source IDs differ by locale`);
        }
      });
    }
  }

  if (errors.length) throw new Error(`Invalid curated tour content:\n- ${errors.join('\n- ')}`);
  return true;
};
