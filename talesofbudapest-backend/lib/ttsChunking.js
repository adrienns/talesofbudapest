/**
 * Direct Gemini TTS can truncate audio past ~60–100s per request.
 * Chunk long scripts at sentence boundaries and concatenate PCM downstream.
 */
export const TTS_MAX_WORDS_PER_CHUNK = 110;

const countWords = (text) => text.trim().split(/\s+/).filter(Boolean).length;

const splitSentences = (text) => {
  const parts = text.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g);
  if (!parts?.length) return [text.trim()].filter(Boolean);
  return parts.map((part) => part.trim()).filter(Boolean);
};

/** @returns {string[]} */
export const chunkTextForTts = (text, maxWords = TTS_MAX_WORDS_PER_CHUNK) => {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return [];
  if (countWords(trimmed) <= maxWords) return [trimmed];

  const sentences = splitSentences(trimmed);
  const chunks = [];
  let bucket = [];
  let words = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (words + sentenceWords > maxWords && bucket.length) {
      chunks.push(bucket.join(' '));
      bucket = [];
      words = 0;
    }

    if (sentenceWords > maxWords) {
      if (bucket.length) {
        chunks.push(bucket.join(' '));
        bucket = [];
        words = 0;
      }
      chunks.push(sentence);
      continue;
    }

    bucket.push(sentence);
    words += sentenceWords;
  }

  if (bucket.length) chunks.push(bucket.join(' '));
  return chunks.length ? chunks : [trimmed];
};
