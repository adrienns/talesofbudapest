import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const SOURCE_ID = 'MEK-15124';
const VOLUME = 'volume-1';
const PAGES_FILE = path.join(__dirname, '../../ingest/corpus/mek/text/mek-15124_volume-1.pages.txt');
const EXTRACTIONS_FILE = path.join(__dirname, '../../ingest/corpus/mek/experiments/mek-15124_volume-1_deep.jsonl');
const source = {
  id: SOURCE_ID,
  title: 'Budapest képes lexicona: Kézikönyv Budapest összes tudnivalóiról',
  author: 'Hell Lajos',
  source_url: 'https://mek.oszk.hu/15100/15124/',
  license: 'Public-Domain',
  license_verdict: 'green',
  attribution: 'Hell Lajos, Budapest képes lexicona, MEK-15124 / OSZK',
  license_evidence_url: 'https://mek.oszk.hu/15100/15124/cedula.html',
};

const key = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();
const hash = (...values) => crypto.createHash('sha256').update(values.join('\u001f')).digest('hex');
const records = (text) => text.split('\n').filter(Boolean).flatMap((line, index) => {
  try { return [JSON.parse(line)]; } catch { console.warn(`Skipping invalid JSONL line ${index + 1}.`); return []; }
});
const pages = (text) => Array.from(text.matchAll(/--- PDF PAGE (\d+) ---\s*\n([\s\S]*?)(?=\n\n--- PDF PAGE \d+ ---|$)/g))
  .map((match) => ({ number: Number(match[1]), raw_text: match[2].trim() })).filter((page) => page.raw_text);
const list = (value) => Array.isArray(value) ? value : [];
const dataObject = (value) => value && typeof value === 'object' ? value : {};
const temporal = (value) => ['historical_fact', 'as_described_in_1939', 'planned_as_of_1939'].includes(value) ? value : 'historical_fact';
const score = (value) => Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
const personSubjectPredicates = new Set(['was_editor_in_chief_of', 'advocated_for', 'died_in', 'commissioned', 'ordered', 'started_construction_of', 'completed_construction_of', 'fought_in_army_of', 'authored', 'composed', 'recited', 'designed', 'created', 'founded', 'lived_at', 'resided_in', 'graduated_from', 'performed_at']);
const personObjectPredicates = new Set(['commemorated_by', 'flourished_under', 'developed_due_to', 'erected_statue_for', 'is_commemorated_by', 'will_be_commemorated_by']);
const looksLikePerson = (name) => /^(?:(?:King|Queen|Palatine|Count|Baron|Saint|Pope|Prince|Princess)\s+)?[A-ZÁÉÍÓÖŐÚÜŰ][\p{L}'’-]+(?:[ -][A-ZÁÉÍÓÖŐÚÜŰ][\p{L}'’-]+)+$/u.test(name);

const rest = async (baseUrl, serviceKey, table, method, body, params = {}, representation = true) => {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: representation ? 'resolution=merge-duplicates,return=representation' : 'resolution=merge-duplicates,return=minimal',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return representation ? response.json() : [];
};

const main = async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  const [pageText, extractionText] = await Promise.all([fs.readFile(PAGES_FILE, 'utf8'), fs.readFile(EXTRACTIONS_FILE, 'utf8')]);
  const allPages = pages(pageText);
  const extracted = records(extractionText);
  if (allPages.length < 300) {
    throw new Error(`Expected a complete book, found only ${allPages.length} text-bearing pages`);
  }

  const dbUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const upsert = (table, rows, onConflict) => rest(dbUrl, serviceKey, table, 'POST', rows, { on_conflict: onConflict });
  const updateIn = (table, column, values, patch) => rest(dbUrl, serviceKey, table, 'PATCH', patch, { [column]: `in.(${values.join(',')})` }, false);
  const totals = { pages: allPages.length, mentions: 0, locations: 0, people: 0, events: 0, facts: 0, relations: 0 };

  await upsert('kg_sources', source, 'id');
  const pageRows = allPages.map((page) => ({
    source_id: SOURCE_ID, volume: VOLUME, page_number: page.number,
    page_ref: `${SOURCE_ID}:${VOLUME}:page-${page.number}`, raw_text: page.raw_text,
  }));
  const storedPages = await upsert('kg_pages', pageRows, 'source_id,volume,page_number');
  const pageIds = new Map(storedPages.map((page) => [page.page_number, page.id]));

  for (const record of extracted) {
    const payload = dataObject(record.payload);
    const [mention] = await upsert('kg_mentions', {
      source_id: SOURCE_ID, source_window_id: record.window_id, payload,
      model: record.model ?? null, prompt_version: record.prompt_version ?? null,
      extraction_usage: dataObject(record.usage), extracted_at: record.extracted_at ?? null,
    }, 'source_id,source_window_id');
    if (!mention) throw new Error(`Could not store mention ${record.window_id}`);
    const windowPageIds = list(record.pdf_pages).map((number) => pageIds.get(number)).filter(Boolean);
    if (windowPageIds.length) {
      await upsert('kg_mention_pages', windowPageIds.map((page_id) => ({ mention_id: mention.id, page_id })), 'mention_id,page_id');
      await updateIn('kg_pages', 'id', windowPageIds, { status: 'extracted', updated_at: new Date().toISOString() });
    }

    const locations = new Map();
    for (const item of list(payload.locations)) {
      if (!item?.name_en?.trim()) continue;
      const [row] = await upsert('kg_locations', {
        source_id: SOURCE_ID, name_key: key(item.name_en), name_en: item.name_en.trim(), source_name_hu: item.source_name_hu ?? null,
        address_en: item.address_en ?? null, source_address_hu: item.source_address_hu ?? null, location_kind: item.kind ?? null,
        evidence: dataObject(item.evidence), first_mention_id: mention.id,
      }, 'source_id,name_key');
      if (row) { locations.set(key(item.name_en), row.id); totals.locations += 1; }
    }
    const people = new Map();
    for (const item of list(payload.people)) {
      if (!item?.name_en?.trim()) continue;
      const [row] = await upsert('kg_people', {
        source_id: SOURCE_ID, name_key: key(item.name_en), canonical_name_en: item.name_en.trim(), source_name_hu: item.source_name_hu ?? null,
        role_en: item.role_en ?? null, evidence: dataObject(item.evidence), is_public_figure: item.is_public_figure === true,
      }, 'source_id,name_key');
      if (row) { people.set(key(item.name_en), row.id); totals.people += 1; }
    }
    const events = new Map();
    for (const item of list(payload.events)) {
      if (!item?.title_en?.trim() || !item?.statement_en?.trim()) continue;
      const [row] = await upsert('kg_events', {
        source_id: SOURCE_ID, event_key: hash(key(item.title_en), key(item.statement_en), String(item.when ?? '')),
        title_en: item.title_en.trim(), statement_en: item.statement_en.trim(), claim_type: item.claim_type ?? null,
        temporal_status: temporal(item.temporal_status), importance: score(item.importance), evidence: dataObject(item.evidence), first_mention_id: mention.id,
      }, 'source_id,event_key');
      if (row) { events.set(key(item.title_en), row.id); totals.events += 1; }
    }
    const factRows = list(payload.facts).filter((item) => item?.statement_en?.trim()).map((item) => ({
      mention_id: mention.id, location_id: locations.get(key(item.location_en)) ?? null, statement_en: item.statement_en.trim(),
      claim_type: item.claim_type ?? null, temporal_status: temporal(item.temporal_status), importance: score(item.importance), evidence: dataObject(item.evidence),
    }));
    if (factRows.length) { await upsert('kg_facts', factRows, 'mention_id,statement_en'); totals.facts += factRows.length; }

    const relationRows = [];
    for (const item of list(payload.relations).filter((relation) => relation?.subject_en?.trim() && relation?.object_en?.trim() && relation?.predicate?.trim())) {
      const subject = item.subject_en.trim(); const object = item.object_en.trim();
      const subjectLocation = locations.get(key(subject)) ?? null; const objectLocation = locations.get(key(object)) ?? null;
      let subjectPerson = people.get(key(subject)) ?? null; let objectPerson = people.get(key(object)) ?? null;
      const subjectEvent = events.get(key(subject)) ?? null; const objectEvent = events.get(key(object)) ?? null;
      const addPersonCandidate = async (name) => {
        const [row] = await upsert('kg_people', {
          source_id: SOURCE_ID, name_key: key(name), canonical_name_en: name,
          evidence: dataObject(item.evidence), is_public_figure: false,
        }, 'source_id,name_key');
        if (row) { totals.people += 1; return row.id; }
        return null;
      };
      if (!subjectLocation && !subjectPerson && personSubjectPredicates.has(item.predicate) && looksLikePerson(subject)) subjectPerson = await addPersonCandidate(subject);
      if (!objectLocation && !objectPerson && personObjectPredicates.has(item.predicate) && looksLikePerson(object)) objectPerson = await addPersonCandidate(object);
      const type = (location, person, event) => location ? 'location' : person ? 'person' : event ? 'event' : 'unknown';
      relationRows.push({
        mention_id: mention.id, subject_text_en: subject, subject_kind: type(subjectLocation, subjectPerson, subjectEvent), predicate: item.predicate.trim(),
        object_text_en: object, object_kind: type(objectLocation, objectPerson, objectEvent), statement_en: item.statement_en ?? null,
        temporal_status: temporal(item.temporal_status), importance: score(item.importance), evidence: dataObject(item.evidence),
        subject_location_id: subjectLocation, subject_person_id: subjectPerson, subject_event_id: subjectEvent,
        object_location_id: objectLocation, object_person_id: objectPerson, object_event_id: objectEvent,
      });
    }
    if (relationRows.length) { await upsert('kg_staged_relations', relationRows, 'mention_id,subject_text_en,predicate,object_text_en'); totals.relations += relationRows.length; }
    totals.mentions += 1;
  }
  console.log(JSON.stringify(totals));
};

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
