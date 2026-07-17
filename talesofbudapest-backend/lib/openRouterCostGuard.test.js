import assert from 'node:assert/strict';
import test from 'node:test';
import { conservativeInputTokenCeiling, estimateExtractionCeiling, pricingForModels, validateExtractionLimit } from './openRouterCostGuard.js';

test('pricing guard rejects a free model that gained a price', () => {
  assert.throws(() => pricingForModels(['example/model:free'], [{
    id: 'example/model:free', pricing: { prompt: '0', completion: '0.000001', request: '0' },
  }]), /no longer free/);
});

test('pricing guard requires token prices and treats an omitted request fee as zero', () => {
  assert.throws(() => pricingForModels(['example/paid'], [{
    id: 'example/paid', pricing: { prompt: '0.000001', request: '0' },
  }]), /Missing OpenRouter completion price/);
  assert.deepEqual(pricingForModels(['example/free:free'], [{
    id: 'example/free:free', pricing: { prompt: '0', completion: '0' },
  }]), [{ modelId: 'example/free:free', prompt: 0, completion: 0, request: 0 }]);
});

test('unbounded extraction requires confirmation and limit zero cannot bypass it', () => {
  assert.throws(() => validateExtractionLimit({ limitRaw: null, confirmFullBook: false }), /Refusing to run unbounded/);
  assert.throws(() => validateExtractionLimit({ limitRaw: '0', confirmFullBook: false }), /positive integer/);
  assert.throws(() => validateExtractionLimit({ limitRaw: '0', confirmFullBook: true }), /positive integer/);
  assert.equal(validateExtractionLimit({ limitRaw: '5', confirmFullBook: false }), 5);
  assert.equal(validateExtractionLimit({ limitRaw: null, confirmFullBook: true }), 0);
});

test('cost ceiling reserves every ladder rung for every request', () => {
  const result = estimateExtractionCeiling({
    requests: ['abcd', '123456'],
    modelPricing: [
      { modelId: 'free', prompt: 0, completion: 0, request: 0 },
      { modelId: 'paid', prompt: 0.000001, completion: 0.000002, request: 0.01 },
    ],
    maxOutputTokens: 100,
  });
  assert.equal(conservativeInputTokenCeiling('árvíz'), Buffer.byteLength('árvíz'));
  assert.equal(result.byModel.length, 2);
  assert.equal(result.usd, 0.02041);
});
