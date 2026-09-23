// Generate schemas/*.json from the zod schemas that the CLI validates with.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { GlobalConfigSchema, LockfileSchema, PackSchema, ProjectConfigSchema, SidecarSchema } from '@agileflow/core';
import { EvalScenarioSchema } from '@agileflow/evals';

const out = fileURLToPath(new URL('../../../schemas/', import.meta.url));
const check = process.argv.includes('--check');
const schemas: Record<string, z.ZodType> = {
  'agileflow.schema.json': ProjectConfigSchema,
  'global-config.schema.json': GlobalConfigSchema,
  'lock.schema.json': LockfileSchema,
  'skill-package.schema.json': SidecarSchema,
  'pack.schema.json': PackSchema,
  'eval.schema.json': EvalScenarioSchema,
};
let stale = 0;
fs.mkdirSync(out, { recursive: true });
for (const [file, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  const text = JSON.stringify({ $id: `https://agileflow.dev/schemas/${file}`, ...json }, null, 2) + '\n';
  const target = path.join(out, file);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current === text) continue;
  stale++;
  if (check) console.error(`schemas/${file} is out of date`);
  else fs.writeFileSync(target, text);
}
if (check && stale) process.exit(1);
console.log(check ? 'schemas up to date' : `schemas: ${stale} file(s) written`);
