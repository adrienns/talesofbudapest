import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createChatCompletion, getOpenRouterApiKey } from '../lib/openRouterClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const INPUT = path.join(__dirname, '../../ingest/corpus/mek/text/mek-15124_volume-1.pages.txt');
const OUTPUT = path.join(__dirname, '../../ingest/corpus/mek/experiments/mek-15124_volume-1_deep.jsonl');
const FAILURE_OUTPUT = path.join(__dirname, '../../ingest/corpus/mek/experiments/mek-15124_volume-1_deep_failures.jsonl');
const MODEL = process.env.KG_DEEP_EXTRACT_MODEL ?? 'google/gemini-2.5-flash';
const PROMPT_VERSION = 'mek-deep-p2';

const SYSTEM_PROMPT = `Return JSON only. You are a forensic Budapest historian creating a cited public knowledge graph from a 1939 Hungarian source.

Extract only explicitly stated, historically meaningful claims. Prioritize city-changing events; destruction/reconstruction; legal or administrative change; institution founding; construction; population change; person-place legacy; cultural artefacts and collections. Exclude directory listings, routine hours, prices, and facilities unless they reveal significant civic or social history.

All user-facing strings must be English. Keep Hungarian only in evidence.quote_source_hu and source_name_hu. Never infer modern facts. Label each claim historical_fact, as_described_in_1939, or planned_as_of_1939. Every record needs page-level evidence, an original Hungarian quote, and its faithful English translation.

Return exactly {locations:[{name_en,source_name_hu,address_en,source_address_hu,kind,evidence}],people:[{name_en,source_name_hu,role_en,is_public_figure,evidence}],events:[{claim_type,title_en,statement_en,when,temporal_status,importance,evidence}],facts:[{claim_type,statement_en,temporal_status,importance,evidence}],relations:[{subject_en,predicate,object_en,statement_en,temporal_status,importance,evidence}]}. Extract a person only when the source identifies or clearly names them; is_public_figure is true only if the source makes this unambiguous. Evidence is {pdf_pages,quote_source_hu,quote_en}. Use precise predicates such as founded, bequeathed_to, commemorated_by, designed, depicted_in; omit unclear relations.`;

const option = (args, name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
};

const parsePages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ page: Number(match[1]), text: match[2].trim() }))
  .filter((page) => page.text);

const makeWindows = (pages) => {
  const windows = [];
  for (let index = 0; index < pages.length; index += 2) {
    const group = pages.slice(index, index + 2);
    windows.push({
      pages: group.map((page) => page.page),
      text: group.map((page) => `--- PDF PAGE ${page.page} ---\n${page.text}`).join('\n\n'),
    });
  }
  return windows;
};

const existingIds = async () => {
  try {
    return new Set((await fs.readFile(OUTPUT, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line).window_id));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
};

const valid = (payload) => payload && ['locations', 'people', 'events', 'facts', 'relations'].every((key) => Array.isArray(payload[key]));

const extract = async (window) => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const completion = await createChatCompletion({
      operation: 'kg.mek_deep_extract',
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `WINDOW PDF PAGES: ${window.pages.join(', ')}\n\n${window.text}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 6000,
      temperature: 0,
    });
    try {
      const payload = JSON.parse(completion.choices?.[0]?.message?.content);
      if (valid(payload)) return { payload, model: completion.model ?? MODEL, usage: completion.usage ?? null, attempts: attempt };
    } catch {
      // Retry once. The JSON payload itself is never staged when invalid.
    }
  }
  throw new Error(`Model returned invalid JSON for pages ${window.pages.join(', ')}`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const limit = Number(option(args, '--limit') ?? 0);
  const fromPage = Number(option(args, '--from-page') ?? 1);
  if (!Number.isInteger(limit) || limit < 0 || !Number.isInteger(fromPage) || fromPage < 1) throw new Error('Invalid --limit or --from-page');
  if (!getOpenRouterApiKey()) throw new Error('OPENROUTER_API_KEY is required');

  const pages = parsePages(await fs.readFile(INPUT, 'utf8')).filter((page) => page.page >= fromPage);
  const windows = makeWindows(pages);
  const selected = limit === 0 ? windows : windows.slice(0, limit);
  const done = await existingIds();
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  console.log(`Deep extraction: ${selected.length} windows using ${MODEL}.`);

  let completed = 0;
  let failures = 0;

  for (const window of selected) {
    const windowId = crypto.createHash('sha256').update(window.text).digest('hex');
    if (done.has(windowId)) continue;
    try {
      const result = await extract(window);
      await fs.appendFile(OUTPUT, `${JSON.stringify({
        window_id: windowId,
        source: 'MEK-15124',
        pdf_pages: window.pages,
        prompt_version: PROMPT_VERSION,
        extracted_at: new Date().toISOString(),
        ...result,
      })}\n`, 'utf8');
      completed += 1;
      console.log(`pages ${window.pages.join('-')}: locations=${result.payload.locations.length} events=${result.payload.events.length} facts=${result.payload.facts.length}`);
    } catch (error) {
      failures += 1;
      await fs.appendFile(FAILURE_OUTPUT, `${JSON.stringify({ pdf_pages: window.pages, error: error instanceof Error ? error.message : String(error), failed_at: new Date().toISOString() })}\n`, 'utf8');
      console.error(`pages ${window.pages.join('-')}: failed; recorded for retry.`);
    }
  }
  console.log(`Completed ${completed}; failed ${failures}; skipped ${selected.length - completed - failures}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
