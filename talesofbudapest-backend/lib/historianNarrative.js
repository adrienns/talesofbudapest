import { createChatCompletion } from './openRouterClient.js';
import { computeHistoryDepth } from './historyDepth.js';

const NARRATIVE_TARGETS = {
  thin: { min: 120, max: 180 },
  standard: { min: 250, max: 400 },
  rich: { min: 400, max: 650 },
};

export const getHistorianModel = () =>
  process.env.OPENROUTER_HISTORIAN_MODEL ??
  process.env.OPENROUTER_MODEL ??
  'google/gemini-2.5-flash';

const buildSystemPrompt = (locale) => `You are a Hungarian architectural historian writing for a cultural heritage app.
Write in ${locale === 'hu' ? 'Hungarian' : 'English'}.

Rules:
- Use only facts present in the source material. Do not invent dates, names, architects, or events.
- Lead with the most compelling verifiable beats — residents, conflicts, transformations — not just construction year and architect.
- Structure chronologically, but surface 3–5 highlight facts a tour guide could open with.
- Third person, factual tone. No atmospheric filler or generic Budapest tourism copy.
- If the source is thin, write a shorter honest account — do not pad.
- Do not mention AI, apps, or tours.`;

const buildUserPrompt = ({ name, sourceMaterial, historyDepth }) => {
  const target = NARRATIVE_TARGETS[historyDepth] ?? NARRATIVE_TARGETS.thin;
  return `Landmark: ${name}

Source material (only facts you may use):
${sourceMaterial}

Write a historian-quality narrative of ${target.min}–${target.max} words.
End with a short "Highlights:" section listing 3–5 bullet facts (each with a date, name, or specific event when available).`;
};

export const enrichHistorianNarrative = async ({
  name,
  sourceMaterial,
  historyDepth = computeHistoryDepth(sourceMaterial ?? ''),
  locale = 'hu',
}) => {
  const material = sourceMaterial?.trim();
  if (!material) {
    throw new Error('source_material is empty — cannot enrich historian narrative');
  }

  const completion = await createChatCompletion({
    operation: 'historian.enrich_location',
    model: getHistorianModel(),
    messages: [
      { role: 'system', content: buildSystemPrompt(locale) },
      { role: 'user', content: buildUserPrompt({ name, sourceMaterial: material, historyDepth }) },
    ],
    max_tokens: historyDepth === 'rich' ? 1200 : historyDepth === 'standard' ? 800 : 500,
    temperature: 0.3,
  });

  const narrative = completion.choices[0]?.message?.content?.trim();
  if (!narrative) {
    throw new Error('Historian narrative generation returned empty content');
  }

  return narrative;
};

export const ensureHistorianNarrative = async ({
  supabase,
  location,
  translation,
  locale = 'hu',
  skipLlmForThin = true,
}) => {
  if (translation?.historical_narrative?.trim()) {
    return translation.historical_narrative.trim();
  }

  const sourceMaterial =
    location.source_material?.trim() || location.story_prompt?.trim() || '';
  const historyDepth = location.history_depth ?? computeHistoryDepth(sourceMaterial);
  const name = translation?.name ?? location.name;

  if (skipLlmForThin && historyDepth === 'thin') {
    return sourceMaterial;
  }

  const narrative = await enrichHistorianNarrative({
    name,
    sourceMaterial,
    historyDepth,
    locale,
  });

  const { error } = await supabase.from('location_translations').upsert(
    {
      location_id: location.id,
      locale,
      name,
      story_prompt: translation?.story_prompt ?? location.story_prompt ?? '',
      historical_narrative: narrative,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'location_id,locale' },
  );

  if (error) {
    throw new Error(`Failed to persist historical_narrative: ${error.message}`);
  }

  return narrative;
};
