import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evalBin = path.join(__dirname, 'eval-historical-items-v2.js');
const fixturePath = path.join(__dirname, '../fixtures/historical-book-items-golden-v3.json');

const runEval = (args) => spawnSync('node', [evalBin, ...args], {
  encoding: 'utf8',
  maxBuffer: 20e6,
});

test('held-out hard-blocks without --approved-run-id even with sol silver manifest', () => {
  const result = runEval(['--v3', '--split', 'heldout', '--allow-incomplete', '--report-only']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const codes = (report.blockers ?? []).map((row) => row.code);
  assert.ok(
    codes.includes('heldout_approved_run_required') || codes.includes('adjudication_manifest_missing'),
    `expected heldout_approved_run_required or adjudication_manifest_missing, got ${codes.join(',')}`,
  );
  assert.equal(report.gate?.passed, false);
});

test('missing freeze content_sha256 is freeze_hash_mismatch and diagnostic_ok false', () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const tmp = path.join(os.tmpdir(), `gold-no-hash-${Date.now()}.json`);
  const clone = structuredClone(fixture);
  delete clone.test_split.content_sha256;
  fs.writeFileSync(tmp, `${JSON.stringify(clone)}\n`);
  const result = runEval(['--v3', '--split', 'test', '--allow-incomplete', '--allow-failed-cost', '--report-only', '--golden', tmp]);
  const report = JSON.parse(result.stdout);
  const codes = (report.blockers ?? []).map((row) => row.code);
  assert.ok(codes.includes('freeze_hash_mismatch'), `expected freeze_hash_mismatch, got ${codes.join(',')}`);
  assert.equal(report.diagnostic_ok, false);
  fs.unlinkSync(tmp);
});

test('mutated freeze item polarity trips freeze_hash_mismatch', () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const tmp = path.join(os.tmpdir(), `gold-polarity-${Date.now()}.json`);
  const clone = structuredClone(fixture);
  const item = clone.items.find((row) => (clone.splits.test ?? []).includes(row.page));
  assert.ok(item);
  item.polarity = `tampered-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(clone)}\n`);
  const result = runEval(['--v3', '--split', 'test', '--allow-incomplete', '--allow-failed-cost', '--report-only', '--golden', tmp]);
  const report = JSON.parse(result.stdout);
  const codes = (report.blockers ?? []).map((row) => row.code);
  assert.ok(codes.includes('freeze_hash_mismatch'), `expected freeze_hash_mismatch, got ${codes.join(',')}`);
  fs.unlinkSync(tmp);
});

test('development report uses immutable source pages not prediction text', () => {
  const result = runEval(['--v3', '--split', 'development', '--allow-incomplete', '--allow-failed-cost', '--report-only']);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.ok(report.exact_grounding?.immutable_source_sha256, 'expected immutable_source_sha256');
  assert.match(String(report.exact_grounding?.note ?? ''), /source-pages/);
  assert.match(String(report.layout_pr?.note ?? ''), /IoU/);
});

test('missing --source-pages fails closed for source verification', () => {
  const missing = path.join(os.tmpdir(), `missing-pages-${Date.now()}.txt`);
  const result = runEval([
    '--v3', '--split', 'development', '--allow-incomplete', '--allow-failed-cost', '--report-only',
    '--source-pages', missing,
  ]);
  const report = JSON.parse(result.stdout);
  const codes = (report.blockers ?? []).map((row) => row.code);
  assert.ok(codes.includes('immutable_source_missing'), `expected immutable_source_missing, got ${codes.join(',')}`);
  assert.equal(report.exact_grounding?.source_verified_rate, 0);
  assert.equal(report.exact_grounding?.pages_with_text, 0);
});

test('held-out hard-blocks unbound approved runs and unbound source hash', () => {
  const result = runEval(['--v3', '--split', 'heldout', '--allow-incomplete', '--report-only', '--approved-run-id', 'not-in-manifest']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const codes = (report.blockers ?? []).map((row) => row.code);
  assert.ok(
    codes.includes('heldout_approved_run_unbound')
      || codes.includes('heldout_approved_run_not_manifest')
      || codes.includes('adjudication_manifest_missing')
      || codes.includes('heldout_items_not_adjudicated'),
    `expected approved-run or adjudication blocker, got ${codes.join(',')}`,
  );
});
