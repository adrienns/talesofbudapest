import assert from 'node:assert/strict';
import test from 'node:test';
import { maskPdfFurniture } from './historicalPdfLayout.js';

test('masks footer text without shifting immutable offsets', () => {
  const fixture = '<page width="512" height="760"><block xMin="100" yMin="50" xMax="400" yMax="60"><word xMin="100">Body</word><word xMin="150">text.</word></block><block xMin="350" yMin="710" xMax="410" yMax="720"><word xMin="350">Kiraly</word><word xMin="390">utca</word><word xMin="405">77</word></block></page>';
  const original = 'Body text. Kiraly utca 77';
  const fake = (command, args) => ({ status: 0, stdout: fixture, stderr: '' });
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 46, text: original }], exec: fake });
  assert.equal(result.pages[0].text.length, original.length);
  assert.equal(result.pages[0].text.slice(0, 10), 'Body text.');
  assert.equal(result.pages[0].text.slice(10).trim(), '');
  assert.equal(result.layout[0].masked_blocks[0].zone, 'footer');
});

test('masks a narrow image caption but leaves body prose', () => {
  const fixture = '<page width="512" height="760"><block xMin="101" yMin="100" xMax="490" yMax="120"><word>Body</word><word>prose.</word></block><block xMin="36" yMin="370" xMax="80" yMax="390"><word>Color</word><word>drawing</word><word>by</word><word>Lipot</word><word>Herman</word></block></page>';
  const original = 'Body prose. Color drawing by Lipot Herman';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 180, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.pages[0].text.length, original.length);
  assert.equal(result.pages[0].text.slice(0, 11), 'Body prose.');
  assert.equal(result.pages[0].text.slice(11).trim(), '');
  assert.equal(result.layout[0].masked_blocks[0].zone, 'caption');
});
