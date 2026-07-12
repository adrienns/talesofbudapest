import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Load talesofbudapest-backend/.env from a cli/*.js entrypoint. */
export const loadCliEnv = (importMetaUrl) => {
  const dirname = path.dirname(fileURLToPath(importMetaUrl));
  dotenv.config({ path: path.join(dirname, '../.env') });
};
