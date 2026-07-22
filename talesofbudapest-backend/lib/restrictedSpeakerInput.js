/**
 * Resolve default restricted-book entities JSONL for map/browser.
 * Speakers-annotated artifact is required unless --input is explicit.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{
 *   source: string,
 *   extractionsDir: string,
 *   explicitInput?: string|null,
 *   existsSync?: (path: string) => boolean,
 * }} options
 */
export const resolveRestrictedEntitiesInput = ({
  source,
  extractionsDir,
  explicitInput = null,
  existsSync = fs.existsSync,
}) => {
  if (explicitInput) {
    return {
      input: path.resolve(explicitInput),
      provenance: 'explicit_input',
      warning: null,
    };
  }
  const speakers = path.join(extractionsDir, `${source}.entities.content.speakers.jsonl`);
  if (existsSync(speakers)) {
    return {
      input: speakers,
      provenance: 'content_speakers',
      warning: null,
    };
  }
  const expected = path.basename(speakers);
  throw new Error(
    `Missing required speakers artifact: ${speakers}. `
    + `Run: npm run annotate:restricted:speakers -- --source ${source}. `
    + `Legacy unannotated JSONL is only allowed via explicit --input (refusing default fallthrough to prevent silent attribution regression). `
    + `Expected file: ${expected}`,
  );
};
