#!/usr/bin/env bun
import * as z from 'zod';

const SCHEMA_OUTPUT_PATH = 'assets/cc-safety-net.schema.json';

const CommandNameSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
  .describe("Command name such as 'git', 'docker', or 'rtk'.");

const RuleOverrideSchema = z
  .union([
    z.literal('off'),
    z.strictObject({
      reason: z.string().min(1).max(256).describe('Replacement block reason'),
    }),
  ])
  .describe('Disable a rule or replace its block reason.');

const ConfigSchema = z.strictObject({
  $schema: z.string().optional().describe('JSON Schema reference for IDE support'),
  version: z.literal(1).describe('Schema version (must be 1)'),
  rules: z
    .array(z.string().min(1))
    .default([])
    .describe('Rulebook source strings such as project-rules or owner/repo#main/team-rules'),
  overrides: z.record(z.string(), RuleOverrideSchema).default({}).describe('Rule overrides by id'),
  transparent_wrappers: z
    .array(CommandNameSchema)
    .default([])
    .describe('Commands that transparently execute a visible protected child command'),
});

async function main(): Promise<void> {
  console.log('Generating JSON Schema...');

  const jsonSchema = z.toJSONSchema(ConfigSchema, {
    io: 'input',
    target: 'draft-7',
  }) as Record<string, unknown>;
  setUniqueItems(jsonSchema, 'transparent_wrappers');

  const finalSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json',
    title: 'CC Safety Net Configuration',
    description: 'Configuration file for cc-safety-net rulebook sources and local policy',
    ...jsonSchema,
  };

  await Bun.write(SCHEMA_OUTPUT_PATH, `${JSON.stringify(finalSchema, null, 2)}\n`);

  // Format with Biome to ensure consistent formatting with the linter
  const result = Bun.spawnSync(['bunx', 'biome', 'format', '--write', SCHEMA_OUTPUT_PATH]);
  if (result.exitCode !== 0) {
    console.error('Failed to format schema:', result.stderr.toString());
    process.exit(1);
  }

  console.log(`✓ JSON Schema generated: ${SCHEMA_OUTPUT_PATH}`);
}

function setUniqueItems(schema: Record<string, unknown>, propertyName: string): void {
  if (!schema.properties || typeof schema.properties !== 'object') return;

  const property = (schema.properties as Record<string, unknown>)[propertyName];
  if (!property || typeof property !== 'object') return;

  (property as Record<string, unknown>).uniqueItems = true;
}

main();
