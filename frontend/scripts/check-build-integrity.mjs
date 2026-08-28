#!/usr/bin/env node
/**
 * Fails the build if a build-config file looks tampered with.
 *
 * On 2026-07-30 an obfuscated payload was appended to vite.config.js
 * (commit 0deba66) and re-appended on 2026-08-26 (commit 8bdc162) by an
 * automated process. Because Vite executes its config during the build,
 * the payload ran in CI with deployment secrets in scope.
 *
 * This runs as `prebuild`, before Vite loads anything, so a poisoned config
 * aborts the build instead of executing.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Build configs execute at build time, so they are the high-value targets.
const WATCHED = [
  'vite.config.js',
  'vite.config.ts',
  'postcss.config.js',
  'tailwind.config.js',
];

// Each signature is something a hand-written config has no reason to contain.
const SIGNATURES = [
  { pattern: /global\s*\[\s*['"]r['"]\s*\]\s*=\s*require/, label: "smuggles require() into global scope" },
  { pattern: /global\s*\[\s*['"]m['"]\s*\]\s*=\s*module/, label: 'smuggles module into global scope' },
  { pattern: /_0x[0-9a-f]{4,}\s*\(/, label: 'obfuscator string-array calls' },
  { pattern: /\bblockNumber\b/, label: 'blockchain RPC reference' },
];

// A normal config is well under this; the payload pushed vite.config.js to ~32KB.
const MAX_BYTES = 8 * 1024;

const problems = [];

for (const name of WATCHED) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;

  const source = fs.readFileSync(file, 'utf8');

  for (const { pattern, label } of SIGNATURES) {
    if (pattern.test(source)) {
      problems.push(`${name}: ${label}`);
    }
  }

  if (Buffer.byteLength(source) > MAX_BYTES) {
    problems.push(`${name}: ${Buffer.byteLength(source)} bytes exceeds ${MAX_BYTES} limit`);
  }

  // Minified payloads get appended as one enormous line.
  const longest = source.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
  if (longest > 2000) {
    problems.push(`${name}: single line of ${longest} chars`);
  }
}

if (problems.length) {
  console.error('\nBuild integrity check FAILED\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nA build config appears to contain injected code. The build was');
  console.error('stopped before it could execute. Inspect the file and restore it');
  console.error('from a known-good commit before building again.\n');
  process.exit(1);
}

console.log('Build integrity check passed');
