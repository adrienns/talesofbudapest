import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProtocol } from './extract-historical-book-v2.js';

test('quarantines malformed audit item lines instead of treating them as facts', () => {
  const response = parseProtocol({ choices: [{ message: { content: 'I\tc0,c1\tc2,c3\tE\tA generic statement.' } }] }, {
    clauseFromWire: new Map(), mentionFromWire: new Map(),
  });
  assert.equal(response.items.length, 0);
  assert.equal(response.protocol_errors.length, 1);
  assert.equal(response.protocol_errors[0].code, 'unrecognized_protocol_line');
  assert.match(response.protocol_errors[0].line_sha256, /^[a-f0-9]{64}$/u);
});
