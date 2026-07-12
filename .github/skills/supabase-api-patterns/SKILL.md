---
name: supabase-api-patterns
description: "Use for backend work in this project when handling Supabase queries, environment variables, AI API calls, logging, and file output."
user-invocable: true
---

# Supabase and API Patterns

## When to Use
- Reading from or writing to Supabase
- Connecting the backend to Groq, Hugging Face, or similar APIs
- Loading secrets from environment variables
- Building single-purpose Node.js scripts for data fetch, generation, or export

## Core Rules
- Create one reusable Supabase client and import it where needed.
- Load environment variables once at startup with `dotenv.config()`.
- Read secrets from `process.env` and fail fast if a required value is missing.
- Check both `error` and missing `data` after every Supabase call.
- Use `.single()` only when exactly one row is expected.
- Keep database access separate from AI generation and file output.
- Wrap external API calls in `try/catch` and log short, actionable errors.
- Prefer small async functions that do one job end to end.
- Use clear console messages for each major step in the pipeline.
- Keep hardcoded table names, model names, and file paths easy to spot and update.

## Recommended Flow
1. Load environment variables.
2. Create or import the shared Supabase client.
3. Fetch the record you need and validate the result.
4. Send only the required context to the external API.
5. Handle the generated output and persist it if needed.
6. Report success or failure with concise logs.

## Project-Specific Patterns
- Prefer `supabase.from('locations')` style queries for structured data access.
- Keep prompts focused on the selected record rather than passing the whole row unfiltered.
- Use `fs` and `path` only for deliberate export steps, not inside query helpers.
- Treat audio or story generation as a separate stage from data retrieval.

## Good Defaults
- Explicit error handling over silent failure
- Reusable clients over repeated initialization
- Small scripts over monolithic pipelines
- Readable, traceable logs over noisy output