#!/usr/bin/env node
/**
 * Compares translation files with English.
 *
 *   node scripts/i18n-check.mjs            check every locale in apps/desktop/src/i18n/locales
 *   node scripts/i18n-check.mjs --new fr   create locales/fr.json as a copy of en.json to translate
 *
 * Errors (exit code 1): invalid JSON, non-string values, keys that do not exist in English,
 * and placeholders ({name}) that differ from English. Everything else is reported as a note:
 * missing keys (they fall back to English), entries identical to English, and English keys no
 * source file uses any more.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'apps/desktop/src/i18n/locales');
const srcDir = join(root, 'apps/desktop/src');
const PLURAL = /_(zero|one|two|few|many|other)$/u;
const DYNAMIC_PREFIXES = ['plugin.']; // looked up by key built at runtime

const args = process.argv.slice(2);
if (args[0] === '--new') {
  const code = args[1];
  if (!code || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u.test(code)) {
    console.error('Usage: i18n-check.mjs --new <language code, e.g. fr or pt-BR>');
    process.exit(2);
  }
  const target = join(dir, `${code}.json`);
  if (existsSync(target)) {
    console.error(`${target} already exists`);
    process.exit(2);
  }
  writeFileSync(target, readFileSync(join(dir, 'en.json')));
  console.log(
    `Created ${target}. Translate the values; delete any entry you do not want to translate yet.`,
  );
  process.exit(0);
}

const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/gu)]
    .map((m) => m[1])
    .sort()
    .join(',');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

const en = read(join(dir, 'en.json'));
const enKeys = Object.keys(en);
const enBase = new Set(enKeys.map((k) => k.replace(PLURAL, '')));

// Placeholders each English key (or plural group) must keep.
const expected = (key) => {
  if (key in en) return placeholders(en[key]);
  const base = key.replace(PLURAL, '');
  const other = en[`${base}_other`];
  return other === undefined ? undefined : placeholders(other);
};

let errors = 0;
const locales = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json');

for (const file of locales) {
  const code = file.replace(/\.json$/u, '');
  let data;
  try {
    data = read(join(dir, file));
  } catch (e) {
    console.error(`✗ ${code}: invalid JSON (${e.message})`);
    errors += 1;
    continue;
  }
  const bad = [];
  let translated = 0;
  let same = 0;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' || value.trim() === '') {
      bad.push(`${key}: value must be a non-empty string`);
      continue;
    }
    const base = key.replace(PLURAL, '');
    if (!(key in en) && !(PLURAL.test(key) && enBase.has(base))) {
      bad.push(`${key}: not a key in en.json (typo or removed)`);
      continue;
    }
    const want = expected(key);
    if (want !== undefined && placeholders(value) !== want) {
      bad.push(`${key}: placeholders {${placeholders(value)}} differ from English {${want}}`);
      continue;
    }
    if (value === en[key]) same += 1;
    else translated += 1;
  }
  const missing = [...enBase].filter(
    (b) => !(b in data) && !Object.keys(data).some((k) => k.replace(PLURAL, '') === b),
  );
  const pct = Math.round((translated / enBase.size) * 100);
  console.log(
    `${bad.length ? '✗' : '✓'} ${code}: ${translated}/${enBase.size} translated (${pct}%), ${same} same as English, ${missing.length} missing`,
  );
  for (const b of bad) console.error(`    error: ${b}`);
  if (missing.length && missing.length <= 15) console.log(`    missing: ${missing.join(', ')}`);
  errors += bad.length;
}

// English keys nothing refers to any more.
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (
      /\.(tsx?|ts)$/u.test(e.name) &&
      !e.name.endsWith('.test.ts') &&
      !p.includes('/i18n/locales/')
    )
      files.push(p);
  }
};
walk(srcDir);
const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const unused = [...enBase].filter(
  (b) =>
    !DYNAMIC_PREFIXES.some((p) => b.startsWith(p)) &&
    !source.includes(`'${b}'`) &&
    !source.includes(`"${b}"`) &&
    !source.includes(`\`${b}\``),
);
console.log(`en: ${enBase.size} messages${unused.length ? `, ${unused.length} unused` : ''}`);
if (unused.length)
  console.log(`    unused: ${unused.slice(0, 20).join(', ')}${unused.length > 20 ? ', …' : ''}`);

if (errors) {
  console.error(`\n${errors} error(s)`);
  process.exit(1);
}
