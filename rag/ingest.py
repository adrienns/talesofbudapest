#!/usr/bin/env python3
"""
Ingest historical text into document_chunks for RAG retrieval.

Usage:
  export DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/postgres
  export OPENAI_API_KEY=sk-...
  python ingest.py --file ./corpus/sample.txt --source-id budapest-sample-001
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2
import tiktoken
from dotenv import load_dotenv
from openai import OpenAI
from psycopg2.extras import Json

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
MIN_TOKENS = 500
MAX_TOKENS = 800


def load_text(file_path: Path) -> str:
    return file_path.read_text(encoding="utf-8").strip()


def split_into_chunks(text: str, min_tokens: int, max_tokens: int) -> list[str]:
    encoding = tiktoken.encoding_for_model("gpt-4o")
    paragraphs = [part.strip() for part in text.split("\n\n") if part.strip()]

    chunks: list[str] = []
    current: list[str] = []
    current_tokens = 0

    for paragraph in paragraphs:
        paragraph_tokens = len(encoding.encode(paragraph))

        if paragraph_tokens > max_tokens:
            if current:
                chunks.append("\n\n".join(current))
                current = []
                current_tokens = 0

            words = paragraph.split()
            buffer: list[str] = []
            buffer_tokens = 0
            for word in words:
                word_tokens = len(encoding.encode(word + " "))
                if buffer_tokens + word_tokens > max_tokens and buffer:
                    chunks.append(" ".join(buffer))
                    buffer = [word]
                    buffer_tokens = len(encoding.encode(word))
                else:
                    buffer.append(word)
                    buffer_tokens += word_tokens
            if buffer:
                chunks.append(" ".join(buffer))
            continue

        if current_tokens + paragraph_tokens > max_tokens and current_tokens >= min_tokens:
            chunks.append("\n\n".join(current))
            current = [paragraph]
            current_tokens = paragraph_tokens
        else:
            current.append(paragraph)
            current_tokens += paragraph_tokens

    if current:
        chunks.append("\n\n".join(current))

    return [chunk for chunk in chunks if chunk.strip()]


def embed_texts(client: OpenAI, texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def upsert_chunks(
    connection,
    source_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    metadata: dict,
) -> None:
    with connection.cursor() as cursor:
        for index, (chunk_text, embedding) in enumerate(zip(chunks, embeddings, strict=True)):
            if len(embedding) != EMBEDDING_DIMS:
                raise ValueError(f"Expected {EMBEDDING_DIMS} dimensions, got {len(embedding)}")

            cursor.execute(
                """
                insert into public.document_chunks (
                  source_id,
                  chunk_index,
                  chunk_text,
                  embedding,
                  metadata
                )
                values (%s, %s, %s, %s::vector, %s)
                on conflict (source_id, chunk_index)
                do update set
                  chunk_text = excluded.chunk_text,
                  embedding = excluded.embedding,
                  metadata = excluded.metadata
                """,
                (
                    source_id,
                    index,
                    chunk_text,
                    json.dumps(embedding),
                    Json(metadata),
                ),
            )
    connection.commit()


def parse_metadata(raw: str | None) -> dict:
    if not raw:
        return {}
    return json.loads(raw)


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Ingest historical text for RAG")
    parser.add_argument("--file", required=True, type=Path, help="Path to source text file")
    parser.add_argument("--source-id", required=True, help="Stable source identifier")
    parser.add_argument("--metadata", help='JSON metadata, e.g. {"era":"1956 Revolution"}')
    args = parser.parse_args()

    database_url = os.getenv("DATABASE_URL")
    openai_api_key = os.getenv("OPENAI_API_KEY")

    if not database_url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 1

    if not openai_api_key:
        print("OPENAI_API_KEY is required", file=sys.stderr)
        return 1

    if not args.file.exists():
        print(f"File not found: {args.file}", file=sys.stderr)
        return 1

    text = load_text(args.file)
    chunks = split_into_chunks(text, MIN_TOKENS, MAX_TOKENS)

    if not chunks:
        print("No chunks produced from input file", file=sys.stderr)
        return 1

    metadata = parse_metadata(args.metadata)
    metadata.setdefault("source_file", str(args.file))

    client = OpenAI(api_key=openai_api_key)
    embeddings = embed_texts(client, chunks)

    connection = psycopg2.connect(database_url)
    try:
        upsert_chunks(connection, args.source_id, chunks, embeddings, metadata)
    finally:
        connection.close()

    print(f"Ingested {len(chunks)} chunks for source_id={args.source_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
