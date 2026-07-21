import { foldText } from './historicalExtractionV2.js';

export const LAYOUT_IOU_MIN = 0.5;

/** Stable reference target: prefer entity id, else mention id, else adjudicated label. */
export const referenceTargetKey = (row) => {
  if (row?.resolved_entity_id) return `entity:${row.resolved_entity_id}`;
  if (row?.antecedent_mention_id) return `mention:${row.antecedent_mention_id}`;
  if (row?.antecedent_label) return `label:${foldText(row.antecedent_label)}`;
  return null;
};

const boxArea = (box) => Math.max(0, (box.x_max - box.x_min) * (box.y_max - box.y_min));

export const boxIoU = (left, right) => {
  const x1 = Math.max(left.x_min, right.x_min);
  const y1 = Math.max(left.y_min, right.y_min);
  const x2 = Math.min(left.x_max, right.x_max);
  const y2 = Math.min(left.y_max, right.y_max);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = boxArea(left) + boxArea(right) - intersection;
  return union > 0 ? intersection / union : 0;
};

/** 1:1 layout zone match by page + zone + IoU (+ optional text hash). */
export const matchLayoutZones = (goldZones, predictedBlocks, { minIoU = LAYOUT_IOU_MIN } = {}) => {
  const candidates = goldZones.flatMap((gold, goldIndex) => predictedBlocks.flatMap((pred, predIndex) => {
    if (gold.page !== pred.page || gold.zone !== pred.zone) return [];
    // When gold binds a text hash, prediction must supply the same hash (no omit bypass).
    if (gold.text_sha256 && gold.text_sha256 !== pred.text_sha256) return [];
    const score = boxIoU(gold, pred);
    return score >= minIoU ? [{ goldIndex, predIndex, score }] : [];
  })).sort((a, b) => b.score - a.score);
  const usedGold = new Set();
  const usedPred = new Set();
  let matched = 0;
  for (const candidate of candidates) {
    if (usedGold.has(candidate.goldIndex) || usedPred.has(candidate.predIndex)) continue;
    usedGold.add(candidate.goldIndex);
    usedPred.add(candidate.predIndex);
    matched += 1;
  }
  return { matched, expected: goldZones.length, predicted: predictedBlocks.length };
};
