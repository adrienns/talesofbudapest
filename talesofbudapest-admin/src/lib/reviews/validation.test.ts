import assert from 'node:assert/strict'
import test from 'node:test'
import { cappedLimit, parseDecisionInput } from './validation'

const id = '11111111-1111-4111-8111-111111111111'

test('accepts an explicit canonical approval', () => {
  assert.deepEqual(parseDecisionInput({ kind: 'claim', id, decision: 'approve' }), { kind: 'claim', id, decision: 'approve' })
})

test('location approval requires a public location id', () => {
  assert.throws(() => parseDecisionInput({ kind: 'location_connection', id, decision: 'approve' }), /publicLocationId/)
  assert.deepEqual(parseDecisionInput({ kind: 'location_connection', id, decision: 'reject' }), { kind: 'location_connection', id, decision: 'reject' })
})

test('rejects implicit decisions, invalid ids and extra location targets', () => {
  assert.throws(() => parseDecisionInput({ kind: 'claim', id, decision: true }), /explicitly/)
  assert.throws(() => parseDecisionInput({ kind: 'claim', id: 'no', decision: 'approve' }), /valid item id/)
  assert.throws(() => parseDecisionInput({ kind: 'claim', id, decision: 'approve', publicLocationId: id }), /only allowed/)
})

test('caps page sizes', () => {
  assert.equal(cappedLimit('500'), 100)
  assert.equal(cappedLimit('0'), 1)
  assert.equal(cappedLimit('oops'), 50)
})

