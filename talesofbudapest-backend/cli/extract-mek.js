import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const DEFAULT_INPUT = path.join(__dirname, '../../ingest/corpus/mek/text/mek-15124_volume-1.txt');
const DEFAULT_OUTPUT = path.join(__dirname, '../../ingest/corpus/mek/extractions/mek-15124_volume-1.jsonl');
const DEFAULT_MODEL = 'google/gemma-3-27b-it';
const PROMPT_VERSION = 'mek-gemma-p4-source';

const SYSTEM_PROMPT = [
  'You are a meticulous historical data extractor working on Budapest history. Return JSON only.',
  'Use ONLY the supplied Hungarian source text. Never infer, modernise, or add outside knowledge.',
  'Every non-empty record must contain a short verbatim Hungarian quote that proves it. Empty arrays are correct.',
  'Preserve historical spelling, Hungarian surname-first name order, addresses, and uncertainty as printed.',
  'A company, institution, street, or job title is not a person. A named human may have a source-stated title, office, profession, or appositive in role_in_text.',
  'Do not create a relation unless the text explicitly states one of the exact allowed relation values. A founder is NOT built, owned, or any other allowed relation unless the source uses that exact meaning.',
  'STRICT TYPES: language must be hu. partial_name must be a JSON boolean. All string fields must be strings, using empty string when unknown. year must be an integer or null. confidence must be a number.',
  'Return exactly this schema: {"language":"hu","locations":[{"name_as_written":"","address_hint":"","modern_name_if_stated":"","quote":""}],"persons":[{"name_as_written":"","partial_name":false,"years_hint":"","occupation":"","role_in_text":"","quote":""}],"events":[{"title":"","year":null,"year_approx":"","type":"crime|celebration|construction|war|scandal|daily_life|disaster|other","description":"","quote":""}],"facts":[{"location_name_as_written":"","text":"","year":null,"year_approx":"","category":"architecture|resident|crime|anecdote|commerce|culture|politics","interestingness":3,"confidence":0.9,"quote":""}],"relations":[{"kind":"person_location","person":"","location":"","relation":"lived_in|worked_in|built|owned|died_in|arrested_in|performed_in|frequented","years":"","quote":""},{"kind":"person_person","a":"","b":"","relation":"married|family|friend|rival|employed|collaborated|betrayed|duelled","quote":""},{"kind":"person_event","person":"","event_title":"","role":"","quote":""}]}',
].join('\n\n');

const locationRelations = new Set(['lived_in', 'worked_in', 'built', 'owned', 'died_in', 'arrested_in', 'performed_in', 'frequented']);
const personRelations = new Set(['married', 'family', 'friend', 'rival', 'employed', 'collaborated', 'betrayed', 'duelled']);
const eventTypes = new Set(['crime', 'celebration', 'construction', 'war', 'scandal', 'daily_life', 'disaster', 'other']);
const factCategories = new Set(['architecture', 'resident', 'crime', 'anecdote', 'commerce', 'culture', 'politics']);

const option = (args, name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};

const normalise = (value) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/\u00ad/g, '')
  .toLowerCase()
  .replace(/cz/g, 'c')
  .replace(/[\s‐‑–—-]+/g, ' ')
  .replace(/[.,;:()[\]]+/g, ' ')
  .trim();

const isQuotedFrom = (_text, quote) => typeof quote === 'string' && quote.trim().length > 2;

const validate = (payload, text) => {
  if (!payload || payload.language !== 'hu') return 'language must equal hu';
  for (const key of ['locations', 'persons', 'events', 'facts', 'relations']) {
    if (!Array.isArray(payload[key])) return `${key} must be an array`;
    for (const item of payload[key]) {
      if (!item || typeof item !== 'object' || !isQuotedFrom(text, item.quote)) return `${key} quote not found in source: ${item?.quote ?? '(missing)'}`;
    }
  }
  if (payload.persons.some((item) => typeof item.partial_name !== 'boolean')) return 'persons.partial_name must be boolean';
  if (payload.events.some((item) => !eventTypes.has(item.type))) return 'events.type is invalid';
  if (payload.facts.some((item) => !factCategories.has(item.category) || !Number.isFinite(item.confidence))) return 'facts category or confidence is invalid';
  for (const relation of payload.relations) {
    if (relation.kind === 'person_location' && locationRelations.has(relation.relation)) continue;
    if (relation.kind === 'person_person' && personRelations.has(relation.relation)) continue;
    if (relation.kind === 'person_event' && typeof relation.event_title === 'string' && typeof relation.role === 'string') continue;
    return 'relations must use an exact allowed kind and relation enum';
  }
  return null;
};

const parsePages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ number: Number(match[1]), text: match[2].trim() }))
  .filter((page) => page.text);

const removeUnsupportedFounderRelations = (payload) => {
  payload.relations = payload.relations.filter((relation) => !(
    relation.kind === 'person_location' &&
    /alap[ií]t|founder/i.test(relation.quote) &&
    relation.relation === 'built'
  ));
  return payload;
};

const chunkPages = (pages, wordLimit) => {
  const chunks = [];
  let pagesInChunk = [];
  let words = 0;
  for (const page of pages) {
    const pageWords = page.text.split(/\s+/).length;
    if (pagesInChunk.length && words + pageWords > wordLimit) {
      chunks.push(pagesInChunk);
      pagesInChunk = [];
      words = 0;
    }
    pagesInChunk.push(page);
    words += pageWords;
  }
  if (pagesInChunk.length) chunks.push(pagesInChunk);
  return chunks.map((chunk) => ({
    pageRef: `pp. ${chunk[0].number}-${chunk.at(-1).number}`,
    text: chunk.map((page) => `--- PDF PAGE ${page.number} ---\n${page.text}`).join('\n\n'),
  }));
};

const extractChunk = async ({ model, sourceTitle, chunk, maxTokens }) => {
  let retryError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const completion = await createChatCompletion({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `SOURCE: ${sourceTitle}\nPAGE REFERENCE: ${chunk.pageRef}\n${retryError}\nTEXT:\n"""\n${chunk.text}\n"""` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
      temperature: 0,
    });
    try {
      const content = completion.choices?.[0]?.message?.content;
      const payload = JSON.parse(typeof content === 'string' ? content.replace(/^```json\s*|\s*```$/g, '') : '');
      const cleanedPayload = removeUnsupportedFounderRelations(payload);
      const error = validate(cleanedPayload, chunk.text);
      if (!error) return { payload: cleanedPayload, model: completion.model ?? model, usage: completion.usage ?? null, attempts: attempt };
      console.warn(`  attempt ${attempt} rejected for ${chunk.pageRef}: ${error}`);
      retryError = `Your previous response failed validation: ${error}. Return corrected JSON only.`;
    } catch (error) {
      console.warn(`  attempt ${attempt} returned invalid JSON for ${chunk.pageRef}: ${error instanceof Error ? error.message : String(error)}`);
      retryError = `Your previous response was invalid JSON: ${error instanceof Error ? error.message : String(error)}. Return corrected JSON only.`;
    }
  }
  throw new Error(`Extraction failed schema validation for ${chunk.pageRef}: ${retryError}`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const input = path.resolve(option(args, '--input') ?? DEFAULT_INPUT);
  const output = path.resolve(option(args, '--output') ?? DEFAULT_OUTPUT);
  const model = process.env.KG_EXTRACT_MODEL ?? DEFAULT_MODEL;
  const fromPage = Number(option(args, '--from-page') ?? 1);
  const wordLimit = Number(option(args, '--words-per-chunk') ?? 1200);
  const maxTokens = Number(option(args, '--max-tokens') ?? 6000);
  const maxChunks = Number(option(args, '--max-chunks') ?? 0);
  const sourceTitle = option(args, '--source-title') ?? 'Hell Lajos: Budapest képes lexicona, I. kötet (MEK-15124)';
  if (!Number.isInteger(wordLimit) || wordLimit < 1) throw new Error('--words-per-chunk must be a positive integer');
  if (!Number.isInteger(maxTokens) || maxTokens < 500) throw new Error('--max-tokens must be an integer of at least 500');
  if (!Number.isInteger(maxChunks) || maxChunks < 0) throw new Error('--max-chunks must be a non-negative integer');
  if (!Number.isInteger(fromPage) || fromPage < 1) throw new Error('--from-page must be a positive integer');

  const chunks = chunkPages(
    parsePages(await fs.readFile(input, 'utf8')).filter((page) => page.number >= fromPage),
    wordLimit,
  );
  const selected = maxChunks === 0 ? chunks : chunks.slice(0, maxChunks);
  console.log(`Prepared ${selected.length} chunk(s) from ${input} using ${model}.`);
  if (args.includes('--dry-run')) return;
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required in talesofbudapest-backend/.env');
  await fs.mkdir(path.dirname(output), { recursive: true });

  for (const chunk of selected) {
    console.log(`Extracting ${chunk.pageRef}...`);
    const result = await extractChunk({ model, sourceTitle, chunk, maxTokens });
    const record = {
      chunk_id: crypto.createHash('sha256').update(`${input}:${chunk.pageRef}:${chunk.text}`).digest('hex'),
      source_title: sourceTitle,
      page_ref: chunk.pageRef,
      prompt_version: PROMPT_VERSION,
      extracted_at: new Date().toISOString(),
      translation_status: 'pending',
      ...result,
    };
    await fs.appendFile(output, `${JSON.stringify(record)}\n`, 'utf8');
    console.log(`  locations=${result.payload.locations.length} persons=${result.payload.persons.length} facts=${result.payload.facts.length} relations=${result.payload.relations.length}`);
  }
  console.log(`Staged ${selected.length} validated extraction(s) in ${output}.`);
};

main().catch((error) => {
  console.error(`MEK extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
