import assert from 'node:assert/strict'
import test from 'node:test'
import { aliasQuestion, claimQuestion, entityQuestion, locationQuestion } from './mapping'

test('maps database rows into human questions without raw payload fields', () => {
  const question = entityQuestion({ id: 'e', canonical_name_en: 'Dohány Street Synagogue', entity_kind: 'location', review_status: 'needs_review', publication_status: 'private' })
  assert.match(question.question, /valid canonical location/)
  assert.equal(question.publicationStatus, 'private')
  assert.equal('raw_excerpt' in question, false)
})

test('alias and claim questions contain only safe review context', () => {
  const alias = aliasQuestion({ id: 'a', alias: 'Great Synagogue', entity_id: 'e', review_status: 'needs_review', entity: { canonical_name_en: 'Dohány Street Synagogue' } })
  const claim = claimQuestion({ id: 'c', statement_en: 'A cited fact.', subject_entity_id: 'e', review_status: 'needs_review', publication_status: 'private' })
  assert.match(alias.question, /approved alias/)
  assert.equal(claim.title, 'A cited fact.')
  assert.equal(JSON.stringify([alias, claim]).includes('model_payload'), false)
})

test('location questions expose bounded suggestions, not source evidence', () => {
  const item = locationQuestion({ id: 'l', name_en: 'Dohány Street Synagogue', resolution_status: 'pending', source_id: 'private' }, [])
  assert.equal(item.kind, 'location_connection')
  assert.deepEqual(item.suggestions, [])
  assert.equal('evidence' in item.context!, false)
})

