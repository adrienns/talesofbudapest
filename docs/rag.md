# RAG (Retrieval-Augmented Generation)

Python ingest pipeline for embedding historical text into pgvector, intended to ground LLM narration in verified sources.

**Path:** `rag/`

## Status

| Component | Status |
|-----------|--------|
| Schema (`008_rag_history.sql`) | Migrated |
| `rag/ingest.py` | Working ingest script |
| Retrieval in audio pipeline | **Not wired yet** |
| Book PDF extraction | Planned |

## Schema

From `supabase/migrations/008_rag_history.sql`:

### `historical_locations`

Named places for the historical corpus (separate from map `locations` pins).

### `historical_events`

Events with optional link to `historical_locations`.

### `document_chunks`

| Column | Purpose |
|--------|---------|
| `content` | Text chunk |
| `embedding` | `vector(1536)` — OpenAI `text-embedding-3-small` |
| `source_id` | Corpus identifier (e.g. book slug) |
| `metadata` | JSONB (page, chapter, location hints) |
| `location_id` | Optional link to `historical_locations` |

### `match_document_chunks(query_embedding, match_threshold, match_count)`

RPC for cosine similarity search over embeddings.

## Ingest script

**File:** `rag/ingest.py`

```bash
cd rag
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
export OPENAI_API_KEY=sk-...

python ingest.py --file corpus/sample.txt --source-id budapest-sample-001
```

### What it does

1. Read text file
2. Chunk into ~500–800 token segments (tiktoken)
3. Embed each chunk with OpenAI `text-embedding-3-small` (1536 dimensions)
4. Insert into `document_chunks`

### Dependencies (`requirements.txt`)

- `openai`
- `psycopg2-binary`
- `python-dotenv`
- `tiktoken`

## Planned hybrid strategy

The project uses a **hybrid** approach for historical grounding:

| Tier | Source | Role |
|------|--------|------|
| 1 | Budapest100 scrape (`source_material`) | Per-building facts |
| 2 | MEK public-domain books | City-wide historical context |
| 3 | LLM | Style and narration only — not inventing facts |

Suggested starter book: [Hangos-képes útikönyv Budapest](https://mek.oszk.hu/06400/06447/06447.pdf) (Hungarian National Library).

## Future integration

When wired into `historianNarrative.js` / `landmarkAudioPipeline.js`:

1. Embed query (landmark name + key facts)
2. Call `match_document_chunks()` with similarity threshold
3. Pass top chunks as context to historian LLM
4. Require citations / reject low-confidence matches

## Related

- [Database](database.md) — RAG table definitions
- [Backend](backend.md) — historian narrative (RAG hook point)
- [Architecture](architecture.md) — planned data flow
