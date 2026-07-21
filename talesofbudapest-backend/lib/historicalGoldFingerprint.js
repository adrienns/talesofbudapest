import crypto from 'node:crypto';

/** Canonical held-out content fingerprint shared by merge + eval. */
export const heldoutContentFingerprint = (fixture) => crypto.createHash('sha256')
  .update(JSON.stringify({
    annotation_status: fixture.annotation_status ?? null,
    minimums: fixture.minimums ?? null,
    immutable_source_sha256: fixture.immutable_source_sha256
      ?? fixture.adjudication_manifest?.immutable_source_sha256
      ?? null,
    approved_run_ids: [...(fixture.adjudication_manifest?.approved_run_ids
      ?? fixture.locked_config?.approved_run_ids
      ?? [])].sort(),
    heldout_pages: [...(fixture.splits?.heldout ?? [])].sort((a, b) => a - b),
    items: [...(fixture.items ?? [])]
      .filter((item) => (fixture.splits?.heldout ?? []).includes(item.page ?? item.pages?.[0]))
      .map((item) => [
        item.id,
        item.page ?? null,
        item.pages ?? null,
        item.gold_source,
        item.adjudication_id,
        item.adjudicator,
        item.statement_hint,
        item.clause_ids,
        item.kind,
        item.assertion_kind,
        item.canonical_type,
        item.open_type,
        item.polarity,
        item.required_terms,
        item.tags,
        item.notes ?? item.note ?? null,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    clauses: [...(fixture.clauses ?? [])]
      .filter((row) => (fixture.splits?.heldout ?? []).includes(row.page))
      .map((row) => [row.clause_id, row.page, row.disposition, row.gold_source, row.adjudication_id, row.adjudicator, row.notes ?? row.note ?? null, row.tags ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    references: [...(fixture.references ?? [])]
      .filter((row) => (fixture.splits?.heldout ?? []).includes(row.page))
      .map((row) => [
        row.clause_id,
        row.page,
        row.surface,
        row.resolved_entity_id ?? null,
        row.antecedent_mention_id ?? null,
        row.antecedent_label ?? null,
        row.gold_source,
        row.adjudication_id,
        row.adjudicator,
        row.notes ?? row.note ?? null,
        row.tags ?? null,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    transitions: [...(fixture.transitions ?? [])]
      .filter((row) => (fixture.splits?.heldout ?? []).includes(row.page))
      .map((row) => [row.clause_id, row.page, row.active_entity_id, row.gold_source, row.adjudication_id, row.adjudicator, row.notes ?? row.note ?? null, row.tags ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    layout_zones: [...(fixture.layout_zones ?? [])]
      .filter((row) => (fixture.splits?.heldout ?? []).includes(row.page))
      .map((row) => [row.page, row.zone, row.x_min, row.y_min, row.x_max, row.y_max, row.text_sha256, row.gold_source, row.adjudication_id, row.adjudicator, row.notes ?? row.note ?? null])
      .sort((a, b) => `${a[0]}:${a[1]}:${a[3]}`.localeCompare(`${b[0]}:${b[1]}:${b[3]}`)),
    negative_items: [...(fixture.negative_items ?? [])]
      .filter((row) => (fixture.splits?.heldout ?? []).includes(row.page))
      .map((row) => [row.id, row.page, row.gold_source, row.adjudication_id, row.adjudicator, row.forbidden_patterns, row.notes ?? row.note ?? null, row.tags ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    locked_config: fixture.locked_config ?? null,
    heldout_dispositions: fixture.heldout_dispositions ?? null,
  }))
  .digest('hex');
