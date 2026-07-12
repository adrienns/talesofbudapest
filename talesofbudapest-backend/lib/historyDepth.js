/** @typedef {'thin' | 'standard' | 'rich'} HistoryDepth */

/** @param {string} sourceMaterial */
export const computeHistoryDepth = (sourceMaterial) => {
  const length = sourceMaterial.trim().length;
  if (length < 400) {
    return 'thin';
  }
  if (length < 1500) {
    return 'standard';
  }
  return 'rich';
};

export const HISTORY_DEPTH_WORD_TARGETS = {
  thin: { easy: [60, 90], storyteller: [80, 120], 'deep-dive': [100, 140] },
  standard: { easy: [110, 165], storyteller: [150, 220], 'deep-dive': [190, 275] },
  rich: { easy: [260, 340], storyteller: [350, 450], 'deep-dive': [430, 550] },
};

export const getWordTarget = (historyDepth, styleId) => {
  const depth = HISTORY_DEPTH_WORD_TARGETS[historyDepth] ?? HISTORY_DEPTH_WORD_TARGETS.thin;
  const style = depth[styleId] ?? depth.storyteller;
  return { min: style[0], max: style[1] };
};
