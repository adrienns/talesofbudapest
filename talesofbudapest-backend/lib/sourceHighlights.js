const TOPIC_KEYWORDS = {
  underground: ['cave', 'thermal', 'bunker', 'barlang', 'fürdő', 'labirintus'],
  shadows: ['jewish', 'ghetto', 'synagogue', '1956', 'holocaust', 'zsidó', 'gettó', 'forradal'],
  duel: ['castle', 'royal', 'bridge', 'danube', 'palace', 'királyi', 'híd', 'duna'],
  architecture: ['architect', 'facade', 'opera', 'parliament', 'építész', 'parlament'],
  liquid: ['ruin bar', 'romkocsma', 'wine', 'unicum', 'tokaj'],
  coffeehouse: ['coffee', 'writer', 'kávéház', 'költő'],
};

const EVENT_PATTERNS = [
  /\bwar\b/i,
  /\bholocaust\b/i,
  /\brevolution\b/i,
  /\bforradal/i,
  /\bháború/i,
  /\bholokauszt/i,
  /\bsiege\b/i,
  /\bostrom\b/i,
  /\bcommunis/i,
  /\bkommunis/i,
  /\bjewish\b/i,
  /\bzsidó/i,
];

const splitSentences = (text) =>
  text
    .split(/\n+|[.!?]+\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 40);

const topicScore = (sentence, topicIds = []) => {
  const haystack = sentence.toLowerCase();
  let best = 0;

  for (const topicId of topicIds) {
    const keywords = TOPIC_KEYWORDS[topicId] ?? [];
    const hits = keywords.reduce((count, kw) => (haystack.includes(kw) ? count + 1 : count), 0);
    best = Math.max(best, Math.min(1, hits / 2));
  }

  return best;
};

const scoreSentence = (sentence, topicIds = []) => {
  let score = 0;

  if (/\b(19|18)\d{2}\b/.test(sentence)) score += 3;
  if (/\b[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+ [A-ZÁÉÍÓÖŐÚÜŰ]/.test(sentence)) score += 2;
  if (EVENT_PATTERNS.some((pattern) => pattern.test(sentence))) score += 4;
  if (/built in|építés|architect|építész/i.test(sentence)) score -= 2;
  score += topicScore(sentence, topicIds) * 3;

  return score;
};

const chronicleHighlights = (chronicle) => {
  if (!chronicle) return [];

  const items = [
    ...(chronicle.facts ?? []).map((fact) => ({
      text: fact.statement,
      score: 5 + (fact.importance ?? 0),
      kind: 'fact',
    })),
    ...(chronicle.events ?? []).map((event) => ({
      text: event.description ? `${event.title}: ${event.description}` : event.title,
      score: 6 + (event.importance ?? 0),
      kind: 'event',
    })),
    ...(chronicle.people ?? []).map((person) => ({
      text: person.summary ? `${person.name}: ${person.summary}` : person.name,
      score: 4,
      kind: 'person',
    })),
  ];

  return items.filter((item) => item.text?.trim());
};

/**
 * @returns {Array<{ text: string, score: number, kind?: string }>}
 */
export const rankSourceHighlights = ({
  sourceMaterial = '',
  historicalNarrative = '',
  chronicle = null,
  topicIds = [],
  limit = 5,
}) => {
  const fromChronicle = chronicleHighlights(chronicle);
  const corpus = [sourceMaterial, historicalNarrative].filter(Boolean).join('\n\n');
  const fromText = splitSentences(corpus).map((text) => ({
    text,
    score: scoreSentence(text, topicIds),
    kind: 'detail',
  }));

  const seen = new Set();
  const merged = [...fromChronicle, ...fromText]
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = item.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return merged.slice(0, limit);
};

export const formatHighlightsForPrompt = (highlights) => {
  if (!highlights?.length) return '';
  return highlights.map((item, index) => `${index + 1}. ${item.text}`).join('\n');
};
