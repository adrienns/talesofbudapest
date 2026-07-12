import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatCompletion } from './openRouterClient.js';

test('strict JSON mode makes exactly one HTTP request on failure', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  let calls = 0;
  process.env.OPENROUTER_API_KEY = 'test-key';
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: false, status: 500, text: async () => 'failure' };
  };
  try {
    await assert.rejects(createChatCompletion({
      model: 'test/model', messages: [], response_format: { type: 'json_object' },
      fallback_without_response_format: false,
    }), /OpenRouter request failed/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('every chat request emits redacted structured start and failure logs', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const logs = [];
  process.env.OPENROUTER_API_KEY = 'test-key';
  console.log = (line) => logs.push(JSON.parse(line));
  globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => 'private provider detail' });
  try {
    await assert.rejects(createChatCompletion({
      model: 'test/model', messages: [{ role: 'user', content: 'do not log me' }],
      operation: 'test.logging', response_format: { type: 'json_object' },
      fallback_without_response_format: false,
    }));
    assert.deepEqual(logs.map((log) => log.event), ['openrouter.request.started', 'openrouter.request.failed']);
    assert.equal(logs[0].operation, 'test.logging');
    assert.equal('content' in logs[0], false);
    assert.equal('error' in logs[1], false);
  } finally {
    console.log = originalLog;
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
