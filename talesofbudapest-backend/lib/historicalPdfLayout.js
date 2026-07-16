import { spawnSync } from 'node:child_process';

const words = (value) => String(value ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const blocksFromXhtml = (xhtml) => {
  const pages = [];
  for (const page of xhtml.matchAll(/<page\s+width="([^"]+)"\s+height="([^"]+)">([\s\S]*?)<\/page>/gu)) {
    const width = Number(page[1]); const height = Number(page[2]);
    const blocks = [];
    for (const block of page[3].matchAll(/<block\s+xMin="([^"]+)"\s+yMin="([^"]+)"\s+xMax="([^"]+)"\s+yMax="([^"]+)">([\s\S]*?)<\/block>/gu)) {
      const text = [...block[5].matchAll(/<word[^>]*>([\s\S]*?)<\/word>/gu)].map((word) => word[1].replace(/&amp;/gu, '&')).join(' ');
      if (text) blocks.push({ x_min: Number(block[1]), y_min: Number(block[2]), x_max: Number(block[3]), y_max: Number(block[4]), text });
    }
    pages.push({ width, height, blocks });
  }
  return pages;
};

const maskExactBlock = (source, blockText) => {
  const tokens = words(blockText);
  if (!tokens.length) return { text: source, masked: 0 };
  const expression = new RegExp(tokens.map(escape).join('\\s+'), 'giu');
  let masked = 0;
  const text = source.replace(expression, (match) => {
    masked += match.length;
    return match.replace(/[^\r\n]/gu, ' ');
  });
  return { text, masked };
};

const captionCue = /\b(?:(?:color\s+)?(?:drawing|photograph|photo|painting|illustration|image|portrait|engraving|map)|(?:drawing|photograph|photo|painting|illustration|image|portrait|engraving|map)\s+by)\b/iu;
const zoneForBlock = (block, page) => {
  if (block.y_min >= page.height * 0.90) return 'footer';
  if (block.y_max <= page.height * 0.032) return 'header';
  // Image captions often share an otherwise quote-like narrow margin block.
  // A caption cue is required, so historical side quotations remain available
  // in a separate lane rather than being discarded by geometry alone.
  if (block.x_min <= page.width * 0.18 && block.x_max <= page.width * 0.30 && captionCue.test(block.text)) return 'caption';
  return null;
};

/**
 * Mask only page furniture, retaining source length and offsets. This keeps
 * flattened OCR evidence immutable while preventing footer/caption words from
 * becoming body clauses. It intentionally fails closed when Poppler fails.
 */
export const maskPdfFurniture = ({ pdfPath, pages, pdftotext = 'pdftotext', exec = spawnSync }) => {
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
    const ignored = sourceLayout.blocks.map((block) => ({ block, zone: zoneForBlock(block, sourceLayout) })).filter((row) => row.zone);
    const maskedBlocks = [];
    for (const { block, zone } of ignored) {
      const masked = maskExactBlock(text, block.text);
      text = masked.text;
      if (masked.masked) maskedBlocks.push({ ...block, masked_characters: masked.masked, zone });
    }
    layout.push({ page_ref: page.page, width: sourceLayout.width, height: sourceLayout.height, masked_blocks: maskedBlocks, body_block_count: sourceLayout.blocks.length - ignored.length, ignored_block_count: ignored.length });
    return { ...page, text };
  });
  return { pages: maskedPages, layout };
};
