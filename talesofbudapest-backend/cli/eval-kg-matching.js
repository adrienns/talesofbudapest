// Golden-set eval harness for KG location matching (docs/VECTOR_DB_IMPROVEMENTS.md
// technique #6). Measures the REAL code path, never a reimplementation:
// - deterministic stage: lib/kgLocationResolver.js's scoreLocationCandidate
//   (the same function cli/resolve-kg-locations.js runs in production).
// - vector stage: raw cosine similarity between mention and candidate
//   embeddings, sourced from (and optionally appended to, with
//   --embed-missing) the same cache cli/embed-kg.js writes.
// - --db: the real match_kg_entity_exact / match_kg_entities_hybrid RPCs
//   (015/016), the latter via lib/kgHybridSearch.js.
//
// This is EXPECTED to fail its pass bars right now -- the Hungarian<->English
// lexicon layers that would close the translation-pair gaps this golden set
// targets haven't been built yet (see docs/VECTOR_DB_IMPROVEMENTS.md's
// rollout order). The harness prints the bars honestly either way; a failing
// run is the correct, informative baseline this whole layer exists to
// produce.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { scoreLocationCandidate } from '../lib/kgLocationResolver.js';
import { embedTexts, embeddingCacheKey, KG_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from '../lib/kgEmbeddings.js';
import { searchEntitiesHybrid } from '../lib/kgHybridSearch.js';
import { normalizeLocationName } from '../lib/kgNormalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const FIXTURES_PATH = path.join(__dirname, '../fixtures/kg-matching-golden.json');
const DEFAULT_CACHE = path.join(__dirname, '../../ingest/corpus/restricted/experiments/kg-embeddings.cache.json');
const LOCATION_PREFIX = 'location: ';

const option = (args, name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? fallback;
};

// Same case-insensitive-substring contract the fixtures were authored and
// validated against: `expected` is a substring of the target candidate name.
const candidateMatchesExpected = (candidateName, expected) => Boolean(expected)
  && String(candidateName ?? '').toLowerCase().includes(String(expected).toLowerCase());

const cosine = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const loadFixtures = async () => {
  const raw = JSON.parse(await fs.readFile(FIXTURES_PATH, 'utf8'));
  return raw.cases;
};

const loadCache = async (cachePath) => {
  try { return JSON.parse(await fs.readFile(cachePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, embeddings: {} }; throw error; }
};

const saveCache = async (cachePath, cache) => {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(cache)}\n`, 'utf8');
  await fs.rename(tempPath, cachePath);
};

// --- Deterministic stage (real resolver code path) --------------------

const deterministicStage = (mention, candidates) => {
  const results = candidates.map((candidate) => ({
    candidate,
    result: scoreLocationCandidate({ name_en: mention }, { name: candidate.name }),
  }));
  results.sort((a, b) => b.result.score - a.result.score);
  return {
    best: results[0] ?? null,
    anyAutoMatch: results.some((row) => row.result.autoMatch),
    anyExactName: results.some((row) => row.result.signals.exactName),
  };
};

// --- Vector stage (raw cosine over cached/embedded vectors) -----------

const vectorStage = (mentionVector, candidates, expected) => {
  const sims = candidates
    .map((candidate) => ({ candidate, sim: cosine(mentionVector, candidate.vector) }))
    .filter((row) => row.sim !== null)
    .sort((a, b) => b.sim - a.sim);
  if (!sims.length) return null;
  const correctSims = expected ? sims.filter((row) => candidateMatchesExpected(row.candidate.name, expected)).map((row) => row.sim) : [];
  const wrongSims = expected ? sims.filter((row) => !candidateMatchesExpected(row.candidate.name, expected)).map((row) => row.sim) : sims.map((row) => row.sim);
  const correctSim = correctSims.length ? Math.max(...correctSims) : null;
  const bestWrongSim = wrongSims.length ? Math.max(...wrongSims) : null;
  return {
    top1: sims[0],
    top3: sims.slice(0, 3),
    correctSim,
    bestWrongSim,
    margin: (correctSim !== null && bestWrongSim !== null) ? correctSim - bestWrongSim : null,
  };
};

// --- Offline mode -------------------------------------------------------

const runOffline = async (fixtures, args) => {
  const cachePath = path.resolve(option(args, '--cache', DEFAULT_CACHE));
  const embedMissing = args.includes('--embed-missing');
  const model = option(args, '--model', process.env.OPENROUTER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL);
  const dimensions = Number(option(args, '--dimensions', KG_EMBEDDING_DIMENSIONS));

  const cache = await loadCache(cachePath);
  cache.version = 1; cache.embeddings ??= {};
  const cacheEntries = Object.values(cache.embeddings);

  // eval_mention entries are golden-set mention vectors stored by --embed-missing;
  // they share the LOCATION_PREFIX input text (embedding-space symmetry with the
  // candidate corpus) but must never be treated as candidates themselves.
  const candidates = cacheEntries
    .filter((entry) => entry.input?.startsWith(LOCATION_PREFIX) && !entry.eval_mention)
    .map((entry, index) => ({ id: index, name: entry.input.slice(LOCATION_PREFIX.length), vector: entry.embedding }));

  const inputToEmbedding = new Map(cacheEntries.map((entry) => [entry.input, entry.embedding]));

  const missingMentions = [];
  const mentionVectors = new Map();
  for (const { mention } of fixtures) {
    const key = `${LOCATION_PREFIX}${mention}`;
    const vector = inputToEmbedding.get(key);
    if (vector) mentionVectors.set(mention, vector);
    else missingMentions.push(mention);
  }

  let embeddedCount = 0;
  if (embedMissing && missingMentions.length) {
    const inputs = [...new Set(missingMentions)].map((mention) => `${LOCATION_PREFIX}${mention}`);
    const response = await embedTexts(inputs, { model, dimensions });
    response.embeddings.forEach((embedding, index) => {
      const input = inputs[index];
      const mention = input.slice(LOCATION_PREFIX.length);
      mentionVectors.set(mention, embedding);
      cache.embeddings[embeddingCacheKey(model, dimensions, input)] = { model, dimensions, input, embedding, eval_mention: true };
      embeddedCount += 1;
    });
    await saveCache(cachePath, cache);
  }
  const skippedMentions = embedMissing ? [] : [...new Set(missingMentions)];

  const perCase = fixtures.map((golden) => {
    const { mention, expected, tags } = golden;
    const det = deterministicStage(mention, candidates);
    const detHit = Boolean(det.best?.result?.autoMatch) && candidateMatchesExpected(det.best.candidate.name, expected);
    const mentionVector = mentionVectors.get(mention);
    const vec = mentionVector ? vectorStage(mentionVector, candidates, expected) : null;
    return {
      mention, expected, tags,
      deterministic: {
        best_candidate: det.best?.candidate.name ?? null, best_score: det.best?.result?.score ?? null,
        auto_match: Boolean(det.best?.result?.autoMatch), exact_name: Boolean(det.best?.result?.signals?.exactName),
        any_auto_match: det.anyAutoMatch, any_exact_name: det.anyExactName, hit: detHit,
      },
      vector: vec ? {
        top1_candidate: vec.top1.candidate.name, top1_sim: Number(vec.top1.sim.toFixed(4)),
        top1_hit: expected !== null && candidateMatchesExpected(vec.top1.candidate.name, expected),
        top3_hit: expected !== null && vec.top3.some((row) => candidateMatchesExpected(row.candidate.name, expected)),
        margin: vec.margin === null ? null : Number(vec.margin.toFixed(4)),
        embedding_available: true,
      } : { embedding_available: false },
    };
  });

  return { perCase, embeddedCount, skippedMentions, embedMissing, cachePath, candidatesCount: candidates.length };
};

// --- DB mode --------------------------------------------------------------

const runDb = async (fixtures, args) => {
  const { createClient } = await import('@supabase/supabase-js');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --db');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const matchCount = Number(option(args, '--match-count', '10'));

  let exactStageAvailable = true;
  const exactStageFor = async (mention) => {
    if (!exactStageAvailable) return null;
    const { data, error } = await supabase.rpc('match_kg_entity_exact', { query_text: normalizeLocationName(mention) });
    if (error) {
      if (/could not find the function|does not exist|PGRST202/i.test(error.message ?? '')) { exactStageAvailable = false; return null; }
      throw new Error(error.message);
    }
    return data ?? [];
  };

  const perCase = [];
  for (const golden of fixtures) {
    const { mention, expected, tags } = golden;
    const exactRows = await exactStageFor(mention);
    const exactBest = exactRows?.[0] ?? null;
    const exactHit = Boolean(exactBest) && candidateMatchesExpected(exactBest.canonical_name_en ?? exactBest.name ?? '', expected);
    const exactAnyHit = Array.isArray(exactRows) && exactRows.length > 0;

    let hybridRows = [];
    let hybridError = null;
    try { hybridRows = await searchEntitiesHybrid({ supabase, queryText: mention, matchCount }); }
    catch (error) { hybridError = error instanceof Error ? error.message : String(error); }

    perCase.push({
      mention, expected, tags,
      deterministic: exactStageAvailable
        ? { any_hit: exactAnyHit, hit: exactHit, top: exactBest }
        : { unavailable: true },
      vector: hybridError
        ? { error: hybridError }
        : {
          top1_candidate: hybridRows[0]?.canonical_name_en ?? null,
          top1_hit: expected !== null && candidateMatchesExpected(hybridRows[0]?.canonical_name_en, expected),
          top3_hit: expected !== null && hybridRows.slice(0, 3).some((row) => candidateMatchesExpected(row.canonical_name_en, expected)),
          embedding_available: true,
        },
    });
  }
  return { perCase, exactStageAvailable };
};

// --- Metrics --------------------------------------------------------------

const rate = (numerator, denominator) => (denominator ? Number((numerator / denominator).toFixed(4)) : null);

const computeMetrics = (perCase) => {
  const translationPairCases = perCase.filter((row) => row.tags.includes('translation-pair'));
  const translationPairHits = translationPairCases.filter((row) => row.deterministic?.hit).length;
  const exactHitRate = rate(translationPairHits, translationPairCases.length);

  const negativeCases = perCase.filter((row) => row.expected === null);
  const negativesClean = negativeCases.filter((row) => !row.deterministic?.any_auto_match && !row.deterministic?.any_exact_name);
  const negativesCleanRate = rate(negativesClean.length, negativeCases.length);

  const positiveWithVector = perCase.filter((row) => row.expected !== null && row.vector?.embedding_available && row.vector?.top1_hit !== undefined);
  const top1Hits = positiveWithVector.filter((row) => row.vector.top1_hit).length;
  const top3Hits = positiveWithVector.filter((row) => row.vector.top3_hit).length;
  const top1Rate = rate(top1Hits, positiveWithVector.length);
  const top3Rate = rate(top3Hits, positiveWithVector.length);

  // The pass bar measures the LAYERED SYSTEM: a positive counts when the
  // deterministic stage (exact alias/lexicon) hits, or, failing that, the
  // vector fallback ranks the expected candidate first. Vector-only top1/top3
  // stay as informational diagnostics — vectors never decide links alone.
  const positives = perCase.filter((row) => row.expected !== null);
  const systemHits = positives.filter((row) => row.deterministic?.hit || row.vector?.top1_hit).length;
  const systemTop1Rate = rate(systemHits, positives.length);

  const margins = positiveWithVector.map((row) => row.vector.margin).filter((value) => value !== null && value !== undefined);
  const meanMargin = margins.length ? Number((margins.reduce((sum, value) => sum + value, 0) / margins.length).toFixed(4)) : null;

  return {
    exact_hit_rate: { value: exactHitRate, bar: 1.0, pass: exactHitRate !== null && exactHitRate >= 1.0, n: translationPairCases.length },
    system_top1: { value: systemTop1Rate, bar: 0.95, pass: systemTop1Rate !== null && systemTop1Rate >= 0.95, n: positives.length },
    vector_top1: { value: top1Rate, n: positiveWithVector.length },
    vector_top3: { value: top3Rate, n: positiveWithVector.length },
    mean_margin: { value: meanMargin, n: margins.length },
    negatives_clean: { value: negativesCleanRate, bar: 1.0, pass: negativesCleanRate !== null && negativesCleanRate >= 1.0, n: negativeCases.length },
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const mode = args.includes('--db') ? 'db' : 'offline';
  const fixtures = await loadFixtures();

  const outcome = mode === 'db' ? await runDb(fixtures, args) : await runOffline(fixtures, args);
  const metrics = computeMetrics(outcome.perCase);

  // A positive case fails only when the SYSTEM misses: neither the
  // deterministic stage nor the vector fallback found the expected candidate.
  // Translation-pair cases additionally fail when their deterministic stage
  // misses (they must never depend on the vector fallback).
  const failures = outcome.perCase.filter((row) => {
    const isTranslationPair = row.tags.includes('translation-pair');
    const isNegative = row.expected === null;
    if (isNegative) return Boolean(row.deterministic?.any_auto_match || row.deterministic?.any_exact_name);
    if (isTranslationPair && !row.deterministic?.hit) return true;
    return !row.deterministic?.hit && row.vector?.top1_hit !== true;
  }).map((row) => ({
    mention: row.mention, expected: row.expected, tags: row.tags,
    deterministic_best: row.deterministic?.best_candidate ?? row.deterministic?.top?.canonical_name_en ?? null,
    vector_top1: row.vector?.top1_candidate ?? null,
  }));

  const bars = Object.fromEntries(Object.entries(metrics).filter(([, m]) => 'pass' in m).map(([name, m]) => [name, m]));
  const anyBarFailed = Object.values(bars).some((m) => m.pass === false);

  const summary = {
    mode,
    fixtures_path: FIXTURES_PATH,
    fixtures_count: fixtures.length,
    ...(mode === 'offline' ? {
      candidates_count: outcome.candidatesCount,
      embed_missing: outcome.embedMissing,
      mentions_embedded_this_run: outcome.embeddedCount,
      mentions_skipped_no_embedding: outcome.skippedMentions.length,
      skipped_mentions: outcome.skippedMentions,
    } : {
      exact_stage_available: outcome.exactStageAvailable,
      note: outcome.exactStageAvailable ? undefined : 'db stage unavailable: rpc/match_kg_entity_exact does not exist yet. Hybrid (vector) stage still ran.',
    }),
    metrics,
    exit_bars: bars,
    safety: 'Read-only evaluation. Never writes to kg_entities/kg_entity_aliases/kg_locations. --embed-missing may append vectors to the local embeddings cache file only.',
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`);
    console.log(JSON.stringify(failures, null, 2));
  }
  if (anyBarFailed) process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
