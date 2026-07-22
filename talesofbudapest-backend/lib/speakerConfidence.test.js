import test from 'node:test';
import assert from 'node:assert/strict';
import { confidenceForSpeaker, speakerNeedsReview } from './speakerConfidence.js';

test('page-local speech_frame_person is high confidence', () => {
  assert.equal(confidenceForSpeaker({
    status: 'resolved',
    reason: 'speech_frame_person',
    resolution_source: 'speech_frame',
  }), 'high');
  assert.equal(speakerNeedsReview({
    status: 'resolved',
    reason: 'speech_frame_person',
    resolution_source: 'speech_frame',
  }), false);
});

test('global roster and page-name expansion need review', () => {
  assert.equal(confidenceForSpeaker({
    status: 'resolved',
    reason: 'speech_frame_person',
    resolution_source: 'speech_frame_global',
  }), 'medium');
  assert.equal(confidenceForSpeaker({
    status: 'resolved',
    reason: 'speech_frame_page_name',
    resolution_source: 'speech_frame_page',
  }), 'low');
  assert.equal(speakerNeedsReview({
    status: 'resolved',
    reason: 'speech_frame_page_name',
    resolution_source: 'speech_frame_page',
  }), true);
});

test('unresolved speakers have null confidence', () => {
  assert.equal(confidenceForSpeaker({ status: 'none', reason: 'no_speech_frame' }), null);
});
