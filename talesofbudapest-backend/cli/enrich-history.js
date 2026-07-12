import dotenv from 'dotenv';
import { supabase } from '../supabaseClient.js';
import { enrichHistorianNarrative } from '../lib/historianNarrative.js';
import { computeHistoryDepth } from '../lib/historyDepth.js';
import { getOpenRouterApiKey } from '../lib/openRouterClient.js';

dotenv.config();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) : null;
  const idIndex = args.indexOf('--id');
  const id = idIndex !== -1 ? args[idIndex + 1] : null;
  const concurrencyIndex = args.indexOf('--concurrency');
  const concurrency = concurrencyIndex !== -1 ? Math.max(1, Number(args[concurrencyIndex + 1]) || 5) : 5;
  return { force, limit, id, concurrency };
};

const run = async () => {
  if (!getOpenRouterApiKey()) {
    console.error('OPENROUTER_API_KEY is required');
    process.exit(1);
  }

  const { force, limit, id, concurrency } = parseArgs();

  let query = supabase
    .from('locations')
    .select('id, name, story_prompt, source_material, history_depth')
    .order('name');

  if (id) {
    query = query.eq('id', id);
  }

  const { data: locations, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const targets = (locations ?? []).slice(0, limit ?? undefined);
  console.log(`Enriching ${targets.length} landmark(s)...`);

  const enrichOne = async (location) => {
    const sourceMaterial =
      location.source_material?.trim() || location.story_prompt?.trim() || '';
    if (!sourceMaterial) {
      console.log(`  skip (no source): ${location.name}`);
      return;
    }

    const { data: huTranslation } = await supabase
      .from('location_translations')
      .select('locale, name, story_prompt, historical_narrative')
      .eq('location_id', location.id)
      .eq('locale', 'hu')
      .maybeSingle();

    if (huTranslation?.historical_narrative?.trim() && !force) {
      console.log(`  skip (has narrative): ${location.name}`);
      return;
    }

    const historyDepth = location.history_depth ?? computeHistoryDepth(sourceMaterial);
    if (historyDepth === 'thin' && !force) {
      const { error: upsertError } = await supabase.from('location_translations').upsert(
        {
          location_id: location.id,
          locale: 'hu',
          name: huTranslation?.name ?? location.name,
          story_prompt: huTranslation?.story_prompt ?? sourceMaterial,
          historical_narrative: sourceMaterial,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'location_id,locale' },
      );
      if (upsertError) throw new Error(upsertError.message);
      console.log(`  thin (no LLM): ${location.name}`);
      return;
    }

    console.log(`  enriching [${historyDepth}]: ${location.name}`);
    const narrative = await enrichHistorianNarrative({
      name: huTranslation?.name ?? location.name,
      sourceMaterial,
      historyDepth,
      locale: 'hu',
    });

    const { error: upsertError } = await supabase.from('location_translations').upsert(
      {
        location_id: location.id,
        locale: 'hu',
        name: huTranslation?.name ?? location.name,
        story_prompt: huTranslation?.story_prompt ?? sourceMaterial,
        historical_narrative: narrative,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'location_id,locale' },
    );
    if (upsertError) throw new Error(upsertError.message);
  };

  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < targets.length) {
      const current = targets[index];
      index += 1;
      await enrichOne(current);
    }
  });
  await Promise.all(workers);

  console.log('Done.');
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
