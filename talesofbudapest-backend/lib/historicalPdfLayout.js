import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const BODY_ALIGNMENT_MIN = 0.99;
const TITLE_SIZE_RATIO = 1.45;
const CAPTION_SIZE_RATIO = 0.92;

const words = (value) => String(value ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** Decode common XHTML entities from pdftotext -bbox-layout output. */
const decodeXhtmlText = (value) => String(value ?? '')
  .replace(/&apos;/gu, "'")
  .replace(/&quot;/gu, '"')
  .replace(/&lt;/gu, '<')
  .replace(/&gt;/gu, '>')
  .replace(/&amp;/gu, '&');
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
const blockConfession = (block, zone) => ({
  x_min: block.x_min, y_min: block.y_min, x_max: block.x_max, y_max: block.y_max,
  word_count: words(block.text).length,
  text_sha256: createHash('sha256').update(block.text).digest('hex'),
  zone,
  reason: 'source_alignment_missing',
});

const blocksFromXhtml = (xhtml) => {
  const pages = [];
  for (const page of xhtml.matchAll(/<page\s+width="([^"]+)"\s+height="([^"]+)">([\s\S]*?)<\/page>/gu)) {
    const width = Number(page[1]); const height = Number(page[2]);
    const blocks = [];
    for (const block of page[3].matchAll(/<block\s+xMin="([^"]+)"\s+yMin="([^"]+)"\s+xMax="([^"]+)"\s+yMax="([^"]+)">([\s\S]*?)<\/block>/gu)) {
      const blockHeight = Number(block[4]) - Number(block[2]);
      const sizedWords = [...block[5].matchAll(/<word\s+xMin="([^"]+)"\s+yMin="([^"]+)"\s+xMax="([^"]+)"\s+yMax="([^"]+)">([\s\S]*?)<\/word>/gu)];
      const bareWords = sizedWords.length ? [] : [...block[5].matchAll(/<word[^>]*>([\s\S]*?)<\/word>/gu)];
      const parts = sizedWords.length
        ? sizedWords.map((word) => ({ text: decodeXhtmlText(word[5]), height: Number(word[4]) - Number(word[2]) }))
        : bareWords.map((word) => ({ text: decodeXhtmlText(word[1]), height: blockHeight }));
      const joined = parts.map((part) => part.text).join(' ');
      if (!joined) continue;
      const heights = parts.map((part) => part.height);
      blocks.push({
        x_min: Number(block[1]), y_min: Number(block[2]), x_max: Number(block[3]), y_max: Number(block[4]),
        text: joined,
        word_heights: heights,
        median_height: median(heights),
      });
    }
    pages.push({ width, height, blocks });
  }
  return pages;
};

const maskExactBlock = (source, blockText) => {
  const tokens = words(blockText);
  if (!tokens.length) return { text: source, masked: 0 };
  // Bbox words omit punctuation while the immutable OCR reading view retains
  // it. Match the same word sequence across punctuation or a line break, but
  // never alter the source: matched characters become offset-preserving spaces.
  // First match only: a short caption like "…V. Obverse." must not also eat
  // "…V. Obverse and reverse." elsewhere on the page.
  const expression = new RegExp(tokens.map(escape).join('[^\\p{L}\\p{N}]+'), 'iu');
  const match = expression.exec(source);
  if (!match) return { text: source, masked: 0 };
  const masked = match[0].length;
  const text = `${source.slice(0, match.index)}${match[0].replace(/[^\r\n]/gu, ' ')}${source.slice(match.index + match[0].length)}`;
  return { text, masked };
};

const captionCue = /\b(?:(?:color\s+)?(?:drawing|photograph|photo|painting|illustration|image|portrait|engraving|map)|(?:drawing|photograph|photo|painting|illustration|image|portrait|engraving|map)\s+by|depicts?|shows?|illustrates?|seal)\b/iu;
const coinCaptionCue = /\b(?:denarius|coin|medal)\b/iu;
const figureNumberCue = /^\d+\.\s+/u;
const wordCount = (block) => words(block.text).length;
const isNarrowMarginBlock = (block, page) => block.x_min <= page.width * 0.18 && block.x_max <= page.width * 0.30;
const verticalGap = (left, right) => Math.max(left.y_min, right.y_min) - Math.min(left.y_max, right.y_max);
const sameCaptionLane = (left, right, page) => (
  Math.abs(left.x_min - right.x_min) <= page.width * 0.025
  && Math.abs(left.x_max - right.x_max) <= page.width * 0.045
  && verticalGap(left, right) <= page.height * 0.04
);
const isMainColumnBlock = (block, page) => (
  block.x_min > page.width * 0.18
  && block.y_min > page.height * 0.08
  && block.y_max < page.height * 0.90
  && (block.x_max - block.x_min) > page.width * 0.35
);
const bodyMedianHeight = (page) => {
  const heights = page.blocks
    .filter((block) => isMainColumnBlock(block, page))
    .flatMap((block) => block.word_heights ?? [block.median_height ?? (block.y_max - block.y_min)]);
  return median(heights) || median(page.blocks.flatMap((block) => block.word_heights ?? [])) || 1;
};
const sizeRatio = (block, bodyHeight) => (block.median_height ?? (block.y_max - block.y_min)) / bodyHeight;

const classifyIgnoredBlocks = (page) => {
  const zones = new Map();
  const bodyHeight = bodyMedianHeight(page);
  for (const block of page.blocks) {
    if (!words(block.text).length) continue;
    if (block.y_min >= page.height * 0.90) zones.set(block, 'footer');
    else if (block.y_max <= page.height * 0.032) zones.set(block, 'header');
  }

  // Chapter titles are short and usually larger than body type. Size is the
  // primary signal; isolation/position remain guards against body headings.
  // Skip punctuation-only blocks (e.g. "*"): words() is empty so maskExactBlock
  // cannot align them, which falsely trips the 99% furniture gate (page 39).
  for (const block of page.blocks) {
    if (zones.has(block) || !words(block.text).length) continue;
    const ratio = sizeRatio(block, bodyHeight);
    const topBand = block.y_min >= page.height * 0.032 && block.y_max <= page.height * 0.14;
    const leftish = block.x_min <= page.width * 0.12 && block.x_max <= page.width * 0.35;
    if (ratio >= TITLE_SIZE_RATIO && wordCount(block) <= 8 && topBand && leftish) {
      zones.set(block, 'title');
      continue;
    }
    if (topBand && leftish && wordCount(block) <= 5 && block.x_max <= page.width * 0.25
      && !page.blocks.some((other) => other !== block && isNarrowMarginBlock(other, page) && verticalGap(block, other) <= page.height * 0.04)) {
      zones.set(block, 'title');
    }
  }

  // Captions: smaller than body type in the figure margin, or the prior
  // cue/lane rules. Size catches long coin labels that exceed the old
  // four-word seed limit (e.g. "5. Denarius of King Béla IV…").
  const captionSeeds = page.blocks.filter((block) => {
    if (zones.has(block) || !isNarrowMarginBlock(block, page)) return false;
    const ratio = sizeRatio(block, bodyHeight);
    const small = ratio > 0 && ratio <= CAPTION_SIZE_RATIO;
    if (small && (captionCue.test(block.text) || coinCaptionCue.test(block.text) || figureNumberCue.test(block.text))) return true;
    if (captionCue.test(block.text)) return true;
    if (coinCaptionCue.test(block.text) && wordCount(block) <= 4 && page.blocks.some((other) => other !== block && isNarrowMarginBlock(other, page) && wordCount(other) <= 8 && sameCaptionLane(block, other, page))) return true;
    return false;
  });
  for (const seed of captionSeeds) {
    zones.set(seed, 'caption');
    for (const block of page.blocks) {
      if (zones.has(block) || !isNarrowMarginBlock(block, page)) continue;
      const ratio = sizeRatio(block, bodyHeight);
      const similarSize = ratio === 0 || Math.abs(ratio - sizeRatio(seed, bodyHeight)) <= 0.2 || ratio <= CAPTION_SIZE_RATIO;
      if (similarSize && wordCount(block) <= 16 && sameCaptionLane(seed, block, page)) zones.set(block, 'caption');
    }
  }
  return page.blocks.flatMap((block) => zones.has(block) ? [{ block, zone: zones.get(block) }] : []);
};

const alignmentRatio = ({ ignored, maskedBlocks }) => {
  if (!ignored.length) return 1;
  return maskedBlocks.length / ignored.length;
};

/**
 * Mask only page furniture, retaining source length and offsets. This keeps
 * flattened OCR evidence immutable while preventing footer/caption words from
 * becoming body clauses. It intentionally fails closed when Poppler fails or
 * classified furniture cannot align into the immutable OCR text.
 */
export const maskPdfFurniture = ({ pdfPath, pages, pdftotext = 'pdftotext', exec = spawnSync, minAlignment = BODY_ALIGNMENT_MIN }) => {
  if (!pages.length) return { pages, layout: [] };
  const first = Math.min(...pages.map((page) => page.page));
  const last = Math.max(...pages.map((page) => page.page));
  const result = exec(pdftotext, ['-bbox-layout', '-f', String(first), '-l', String(last), pdfPath, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`incomplete_layout: pdftotext failed: ${result.error?.message ?? result.stderr?.trim() ?? result.status}`);
  const layoutPages = blocksFromXhtml(result.stdout);
  if (layoutPages.length !== last - first + 1) throw new Error(`incomplete_layout: expected ${last - first + 1} PDF pages, received ${layoutPages.length}`);
  const layout = [];
  const maskedPages = pages.map((page) => {
    const sourceLayout = layoutPages[page.page - first];
    let text = page.text;
    const ignored = classifyIgnoredBlocks(sourceLayout)
      // Longest captions first so a short "…Obverse." seed cannot claim the
      // characters belonging to "…Obverse and reverse." before it is masked.
      .slice()
      .sort((left, right) => words(right.block.text).length - words(left.block.text).length);
    const maskedBlocks = [];
    const unmaskedBlocks = [];
    for (const { block, zone } of ignored) {
      const masked = maskExactBlock(text, block.text);
      text = masked.text;
      if (masked.masked) maskedBlocks.push({ ...block, masked_characters: masked.masked, zone, median_height: block.median_height, size_ratio: sizeRatio(block, bodyMedianHeight(sourceLayout)) });
      else unmaskedBlocks.push(blockConfession(block, zone));
    }
    const aligned = alignmentRatio({ ignored, maskedBlocks });
    if (ignored.length && aligned < minAlignment) {
      throw new Error(`incomplete_layout: furniture alignment ${(aligned * 100).toFixed(1)}% below ${(minAlignment * 100).toFixed(0)}% on page ${page.page}`);
    }
    layout.push({
      page_ref: page.page,
      width: sourceLayout.width,
      height: sourceLayout.height,
      body_median_height: bodyMedianHeight(sourceLayout),
      furniture_alignment: aligned,
      masked_blocks: maskedBlocks,
      unmasked_blocks: unmaskedBlocks,
      body_block_count: sourceLayout.blocks.length - ignored.length,
      ignored_block_count: ignored.length,
    });
    return { ...page, text };
  });
  return { pages: maskedPages, layout };
};

export { classifyIgnoredBlocks, bodyMedianHeight, sizeRatio, blocksFromXhtml };
