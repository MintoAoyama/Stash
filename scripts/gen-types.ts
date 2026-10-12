import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileFromFile } from 'json-schema-to-typescript';

const ROOT = join(import.meta.dirname, '..');
export const SCHEMA_FILE = join(ROOT, 'schema/work.schema.json');
export const TYPES_FILE = join(ROOT, 'src/work-file.ts');

export function generate(): Promise<string> {
  return compileFromFile(SCHEMA_FILE, {
    bannerComment: '/* Generated from schema/work.schema.json by `npm run gen`. Do not edit. */',
    // Objects without an explicit additionalProperties get no index signature; the schema itself stays open.
    additionalProperties: false,
    cwd: ROOT,
  });
}

if (import.meta.main) {
  writeFileSync(TYPES_FILE, await generate());
}
