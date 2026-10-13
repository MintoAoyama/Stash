import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { workDataPath } from './pages.ts';

export interface DataProblem {
  file: string; // repo-relative once reported by loadWorks
  message: string;
}

// Thrown when data files cannot be rendered correctly.
export class DataError extends Error {
  problems: DataProblem[];

  constructor(problems: DataProblem[]) {
    super(`${problems.length} problem(s) in data files`);
    this.problems = problems;
  }
}

const SCHEMA_FILE = join(import.meta.dirname, '../schema/work.schema.json');

let validator: ReturnType<InstanceType<typeof Ajv2020.default>['compile']> | undefined;

// relPath is relative to data/works, for example "k/mgx3a1k.json".
export function validateWorkFile(json: string, relPath: string): DataProblem[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return [{ file: relPath, message: `invalid JSON: ${(e as Error).message}` }];
  }
  validator ??= new Ajv2020.default({ allErrors: true, strict: true }).compile(JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')));
  const problems: DataProblem[] = [];
  if (!validator(data)) {
    for (const e of validator.errors ?? []) problems.push({ file: relPath, message: `${e.instancePath || '/'} ${e.message}` });
  } else {
    const work = data as { id: string; logs: { id: string }[] };
    const expected = workDataPath(work.id);
    if (relPath !== expected) problems.push({ file: relPath, message: `/id must match the file path (expected ${expected})` });
    for (const id of duplicates(work.logs.map((l) => l.id))) problems.push({ file: relPath, message: `/logs ids must be unique (duplicate: ${id})` });
  }
  return problems;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

// GitHub Actions workflow command: shows up as an annotation on the run.
export function annotation(p: DataProblem): string {
  const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::error file=${esc(p.file)}::${esc(p.message)}`;
}
