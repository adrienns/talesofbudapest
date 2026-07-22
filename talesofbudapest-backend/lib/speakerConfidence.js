/**
 * Confidence tiers for restricted quote-speaker attribution.
 * Fail-closed display: consumers may hide or badge low/medium fallbacks.
 */

/** @typedef {'high'|'medium'|'low'} SpeakerConfidence */

/**
 * @param {{ status?: string, reason?: string, resolution_source?: string|null }} speaker
 * @returns {SpeakerConfidence|null}
 */
export const confidenceForSpeaker = (speaker) => {
  if (!speaker || speaker.status !== 'resolved') return null;
  const source = speaker.resolution_source ?? null;
  const reason = speaker.reason ?? null;
  if (source === 'speech_frame' && reason === 'speech_frame_person') return 'high';
  if (source === 'speech_frame_prose_adjacent') return 'medium';
  if (source === 'speech_frame_global') return 'medium';
  if (source === 'speech_frame_page' || reason === 'speech_frame_page_name') return 'low';
  // Unknown resolved path — treat as medium pending audit.
  return 'medium';
};

export const speakerNeedsReview = (speaker) => {
  const tier = confidenceForSpeaker(speaker);
  return tier === 'medium' || tier === 'low';
};
