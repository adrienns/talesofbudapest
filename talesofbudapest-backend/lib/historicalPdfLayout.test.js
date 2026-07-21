import assert from 'node:assert/strict';
import test from 'node:test';
import { maskPdfFurniture, classifyIgnoredBlocks, BODY_ALIGNMENT_MIN } from './historicalPdfLayout.js';

test('decodes pdftotext &apos; so apostrophe captions align to OCR', () => {
  // Page 50 regression: bbox-layout emits Lady Sarah&apos;s while OCR has Lady Sarah's.
  const fixture = [
    '<page width="512" height="760">',
    '<block xMin="100" yMin="100" xMax="400" yMax="120"><word xMin="100" yMin="105" xMax="140" yMax="114">Body</word><word xMin="150" yMin="105" xMax="200" yMax="114">prose.</word></block>',
    '<block xMin="36" yMin="50" xMax="120" yMax="70">',
    '<word xMin="36" yMin="52" xMax="50" yMax="60">32.</word>',
    '<word xMin="52" yMin="52" xMax="90" yMax="60">Inscription</word>',
    '<word xMin="92" yMin="52" xMax="105" yMax="60">on</word>',
    '<word xMin="36" yMin="62" xMax="60" yMax="70">Lady</word>',
    '<word xMin="62" yMin="62" xMax="100" yMax="70">Sarah&apos;s</word>',
    '<word xMin="102" yMin="62" xMax="120" yMax="70">grave-</word>',
    '</block>',
    '</page>',
  ].join('');
  const original = "Body prose. 32. Inscription on\nLady Sarah's grave-";
  const result = maskPdfFurniture({
    pdfPath: 'fixture.pdf',
    pages: [{ page: 50, text: original }],
    exec: () => ({ status: 0, stdout: fixture, stderr: '' }),
  });
  assert.equal(result.layout[0].furniture_alignment, 1);
  assert.equal((result.pages[0].text.match(/Sarah/gu) ?? []).length, 0);
  assert.match(result.pages[0].text, /Body prose\./u);
});

test('masks footer text without shifting immutable offsets', () => {
  const fixture = '<page width="512" height="760"><block xMin="100" yMin="50" xMax="400" yMax="60"><word xMin="100" yMin="50" xMax="140" yMax="60">Body</word><word xMin="150" yMin="50" xMax="190" yMax="60">text.</word></block><block xMin="350" yMin="710" xMax="410" yMax="720"><word xMin="350" yMin="710" xMax="390" yMax="720">Kiraly</word><word xMin="390" yMin="710" xMax="405" yMax="720">utca</word><word xMin="405" yMin="710" xMax="410" yMax="720">77</word></block></page>';
  const original = 'Body text. Kiraly utca 77';
  const fake = () => ({ status: 0, stdout: fixture, stderr: '' });
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 46, text: original }], exec: fake });
  assert.equal(result.pages[0].text.length, original.length);
  assert.equal(result.pages[0].text.slice(0, 10), 'Body text.');
  assert.equal(result.pages[0].text.slice(10).trim(), '');
  assert.equal(result.layout[0].masked_blocks[0].zone, 'footer');
});

test('masks a narrow image caption but leaves body prose', () => {
  const fixture = '<page width="512" height="760"><block xMin="101" yMin="100" xMax="490" yMax="120"><word xMin="101" yMin="100" xMax="140" yMax="110">Body</word><word xMin="150" yMin="100" xMax="200" yMax="110">prose.</word></block><block xMin="36" yMin="370" xMax="80" yMax="390"><word xMin="36" yMin="372" xMax="50" yMax="380">Color</word><word xMin="52" yMin="372" xMax="70" yMax="380">drawing</word><word xMin="72" yMin="372" xMax="76" yMax="380">by</word><word xMin="36" yMin="382" xMax="50" yMax="390">Lipot</word><word xMin="52" yMin="382" xMax="80" yMax="390">Herman</word></block></page>';
  const original = 'Body prose. Color drawing by Lipot Herman';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 180, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.pages[0].text.length, original.length);
  assert.equal(result.pages[0].text.slice(0, 11), 'Body prose.');
  assert.equal(result.pages[0].text.slice(11).trim(), '');
  assert.equal(result.layout[0].masked_blocks[0].zone, 'caption');
});

test('masks punctuation-separated inline caption fragments in one narrow lane', () => {
  const fixture = '<page width="512" height="760"><block xMin="130" yMin="280" xMax="490" yMax="310"><word xMin="130" yMin="280" xMax="170" yMax="290">Body</word><word xMin="180" yMin="280" xMax="230" yMax="290">prose.</word></block><block xMin="36" yMin="300" xMax="85" yMax="315"><word xMin="36" yMin="302" xMax="80" yMax="310">Denarius</word></block><block xMin="36" yMin="318" xMax="85" yMax="334"><word xMin="36" yMin="320" xMax="70" yMax="328">Stephen</word><word xMin="72" yMin="320" xMax="80" yMax="328">V</word></block></page>';
  const original = 'Body prose. Denarius, Stephen V.';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 18, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.pages[0].text.length, original.length);
  assert.equal(result.pages[0].text.slice(0, 11), 'Body prose.');
  assert.equal((result.pages[0].text.slice(11).match(/[\p{L}\p{N}]/gu) ?? []).length, 0);
  assert.deepEqual(result.layout[0].masked_blocks.map((block) => block.zone), ['caption', 'caption']);
});

test('masks a short top-of-page chapter title but preserves body prose', () => {
  const fixture = '<page width="512" height="760"><block xMin="20" yMin="50" xMax="110" yMax="70"><word xMin="20" yMin="50" xMax="60" yMax="70">Chapter</word><word xMin="65" yMin="50" xMax="110" yMax="70">Heading</word></block><block xMin="24" yMin="140" xMax="490" yMax="170"><word xMin="24" yMin="145" xMax="60" yMax="155">Body</word><word xMin="70" yMin="145" xMax="120" yMax="155">prose.</word></block></page>';
  const original = 'Chapter Heading Body prose.';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 15, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.pages[0].text.length, original.length);
  assert.equal(result.pages[0].text.trim(), 'Body prose.');
  assert.equal(result.layout[0].masked_blocks[0].zone, 'title');
});

test('masks oversized Hakdome title by font-size ratio', () => {
  // Measured page 15: A Hakdome ~18.9pt vs body ~8.6pt (ratio ~2.2), left margin.
  const fixture = [
    '<page width="595" height="842">',
    '<block xMin="25" yMin="53" xMax="110" yMax="74"><word xMin="25" yMin="53" xMax="40" yMax="72">A</word><word xMin="45" yMin="53" xMax="110" yMax="72">Hakdome</word></block>',
    '<block xMin="120" yMin="140" xMax="500" yMax="160"><word xMin="120" yMin="145" xMax="160" yMax="154">Body</word><word xMin="170" yMin="145" xMax="230" yMax="154">prose</word><word xMin="240" yMin="145" xMax="290" yMax="154">here.</word></block>',
    '</page>',
  ].join('');
  const original = 'A Hakdome Body prose here.';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 15, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.layout[0].masked_blocks.some((block) => block.zone === 'title' && /Hakdome/u.test(block.text)), true);
  assert.match(result.pages[0].text, /Body prose here\./u);
  assert.equal((result.pages[0].text.match(/Hakdome/gu) ?? []).length, 0);
});

test('masks long small-type Denarius caption by size even when over four words', () => {
  // Measured page 18 caption 5: 13 words, height ratio ~0.86, narrow margin.
  const fixture = [
    '<page width="595" height="842">',
    '<block xMin="120" yMin="200" xMax="560" yMax="230"><word xMin="120" yMin="205" xMax="160" yMax="214">Body</word><word xMin="170" yMin="205" xMax="230" yMax="214">mentions</word><word xMin="240" yMin="205" xMax="300" yMax="214">minting.</word></block>',
    '<block xMin="45" yMin="390" xMax="100" yMax="430">',
    '<word xMin="45" yMin="392" xMax="55" yMax="400">5.</word>',
    '<word xMin="58" yMin="392" xMax="95" yMax="400">Denarius</word>',
    '<word xMin="45" yMin="402" xMax="60" yMax="410">of</word>',
    '<word xMin="62" yMin="402" xMax="85" yMax="410">King</word>',
    '<word xMin="45" yMin="412" xMax="70" yMax="420">Bela</word>',
    '<word xMin="72" yMin="412" xMax="90" yMax="420">IV.</word>',
    '<word xMin="45" yMin="422" xMax="95" yMax="430">Obverse.</word>',
    '</block>',
    '</page>',
  ].join('');
  const original = 'Body mentions minting. 5. Denarius of King Bela IV. Obverse.';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 18, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.layout[0].masked_blocks.some((block) => block.zone === 'caption' && /Denarius/u.test(block.text)), true);
  assert.equal((result.pages[0].text.match(/Denarius/gu) ?? []).length, 0);
  assert.match(result.pages[0].text, /Body mentions minting\./u);
});

test('masks Portrait of Mendel caption by cue and smaller type', () => {
  const fixture = [
    '<page width="595" height="842">',
    '<block xMin="110" yMin="200" xMax="560" yMax="220"><word xMin="110" yMin="205" xMax="150" yMax="214">Body</word><word xMin="160" yMin="205" xMax="210" yMax="214">prose.</word></block>',
    '<block xMin="37" yMin="500" xMax="98" yMax="530">',
    '<word xMin="37" yMin="502" xMax="70" yMax="509">Portrait</word>',
    '<word xMin="72" yMin="502" xMax="85" yMax="509">of</word>',
    '<word xMin="37" yMin="512" xMax="70" yMax="519">Mendel</word>',
    '<word xMin="72" yMin="512" xMax="85" yMax="519">on</word>',
    '<word xMin="37" yMin="522" xMax="55" yMax="529">his</word>',
    '<word xMin="57" yMin="522" xMax="85" yMax="529">seal</word>',
    '</block>',
    '</page>',
  ].join('');
  const original = 'Body prose. Portrait of Mendel on his seal';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 24, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.layout[0].masked_blocks[0].zone, 'caption');
  assert.equal((result.pages[0].text.match(/Portrait|Mendel|seal/gu) ?? []).length, 0);
});

test('does not mask clustered top-margin prose without a visual caption cue', () => {
  const fixture = '<page width="512" height="760"><block xMin="20" yMin="50" xMax="110" yMax="70"><word xMin="20" yMin="55" xMax="60" yMax="65">Archive</word><word xMin="65" yMin="55" xMax="100" yMax="65">note</word></block><block xMin="20" yMin="76" xMax="110" yMax="96"><word xMin="20" yMin="80" xMax="90" yMax="90">continues</word></block><block xMin="24" yMin="140" xMax="490" yMax="170"><word xMin="24" yMin="145" xMax="60" yMax="155">Body</word><word xMin="70" yMin="145" xMax="120" yMax="155">prose.</word></block></page>';
  const original = 'Archive note continues Body prose.';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 15, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.pages[0].text, original);
  assert.equal(result.layout[0].masked_blocks.length, 0);
});

test('does not mask a same-size body coin mention', () => {
  const fixture = '<page width="512" height="760"><block xMin="100" yMin="200" xMax="480" yMax="230"><word xMin="100" yMin="205" xMax="160" yMax="215">Denarius</word><word xMin="170" yMin="205" xMax="240" yMax="215">circulated</word><word xMin="250" yMin="205" xMax="300" yMax="215">widely</word></block></page>';
  const original = 'Denarius circulated widely';
  const result = maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 18, text: original }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) });
  assert.equal(result.pages[0].text, original);
  assert.equal(result.layout[0].masked_blocks.length, 0);
});

test('records a machine-readable confession when classified caption cannot align', () => {
  const fixture = '<page width="512" height="760"><block xMin="36" yMin="370" xMax="80" yMax="390"><word xMin="36" yMin="375" xMax="70" yMax="383">Portrait</word><word xMin="72" yMin="375" xMax="80" yMax="383">caption</word></block></page>';
  assert.throws(
    () => maskPdfFurniture({ pdfPath: 'fixture.pdf', pages: [{ page: 24, text: 'Different source text.' }], exec: () => ({ status: 0, stdout: fixture, stderr: '' }) }),
    /incomplete_layout: furniture alignment/,
  );
});

test('alignment gate constant is the documented 99% floor', () => {
  assert.equal(BODY_ALIGNMENT_MIN, 0.99);
});

test('does not classify punctuation-only asterisk as title furniture', () => {
  // Page 39 regression: bbox emits a lone "*" section mark; words() is empty so
  // maskExactBlock cannot align it. Treating it as title tripped the 99% gate
  // and poisoned neighbor pages via boundary context.
  const fixture = [
    '<page width="512" height="760">',
    '<block xMin="21" yMin="40" xMax="400" yMax="60"><word xMin="21" yMin="42" xMax="80" yMax="52">Body</word><word xMin="90" yMin="42" xMax="140" yMax="52">prose.</word></block>',
    '<block xMin="22.6" yMin="81" xMax="26.2" yMax="88"><word xMin="22.6" yMin="81" xMax="26.2" yMax="88">*</word></block>',
    '<block xMin="350" yMin="710" xMax="410" yMax="720"><word xMin="350" yMin="710" xMax="390" yMax="720">CastLe</word><word xMin="390" yMin="710" xMax="410" yMax="720">Hitt</word></block>',
    '<block xMin="420" yMin="710" xMax="440" yMax="720"><word xMin="420" yMin="710" xMax="440" yMax="720">25</word></block>',
    '</page>',
  ].join('');
  const original = 'Body prose.\n* \nMore body. CastLe Hitt 25';
  const result = maskPdfFurniture({
    pdfPath: 'fixture.pdf',
    pages: [{ page: 39, text: original }],
    exec: () => ({ status: 0, stdout: fixture, stderr: '' }),
  });
  assert.equal(result.layout[0].furniture_alignment, 1);
  assert.equal(result.layout[0].masked_blocks.some((block) => block.zone === 'title'), false);
  assert.match(result.pages[0].text, /\*/u);
});

test('classifyIgnoredBlocks exposes size-based title and caption zones', () => {
  const page = {
    width: 595,
    height: 842,
    blocks: [
      { x_min: 25, y_min: 53, x_max: 110, y_max: 74, text: 'A Hakdome', word_heights: [19, 19], median_height: 19 },
      { x_min: 120, y_min: 140, x_max: 500, y_max: 160, text: 'Body prose about the city.', word_heights: [8.5, 8.5, 8.5, 8.5, 8.5], median_height: 8.5 },
      { x_min: 40, y_min: 400, x_max: 95, y_max: 430, text: '5. Denarius of King Bela IV Obverse Enlargement', word_heights: [7, 7, 7, 7, 7, 7, 7], median_height: 7 },
    ],
  };
  const zones = classifyIgnoredBlocks(page);
  assert.equal(zones.find((entry) => /Hakdome/u.test(entry.block.text))?.zone, 'title');
  assert.equal(zones.find((entry) => /Denarius/u.test(entry.block.text))?.zone, 'caption');
});
