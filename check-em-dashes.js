#!/usr/bin/env node
//
// check-em-dashes.js
//
// Fails if an em dash (U+2014) appears in copy an operator can see.
//
// House style: no em dashes in user-facing copy. Use a comma, a colon, a full
// stop or parentheses instead, and "None" or "Not set" where the dash stood in
// for an empty value in a table, a stat card or a field.
//
// Deliberately NOT flagged, because none of it is copy an operator sees:
//   - code comments: // ... , /* ... */ and JSX {/* ... */}
//   - CSS comments in stylesheets
//   - HTML comments: <!-- ... -->
//
// En dashes (U+2013) in numeric ranges such as "10-20" are correct and are
// never flagged. Only U+2014 is.
//
// README.md and AGENTS.md are intentionally out of scope: they are contributor
// documentation on GitHub, not screens in the app.
//
// Run locally:  node check-em-dashes.js
// Exit codes:   0 = clean, 1 = em dash found, 2 = the check itself failed
//

// --- The files this check guards -------------------------------------------
// Keep this list current. Any new route, component or helper under src/ is
// covered by these globs already.
const COVERED_GLOBS = [
  'src/app/**/*.ts',          // route handlers and page metadata
  'src/app/**/*.tsx',         // pages and layouts: on-screen strings
  'src/components/**/*.ts',   // shared components
  'src/components/**/*.tsx',
  'src/lib/**/*.ts',          // formatters, API client, display-label maps
  'src/lib/**/*.tsx',
  'src/**/*.css',             // content: "..." and other rendered text
];
// ---------------------------------------------------------------------------

'use strict';

const fs = require('fs');
const path = require('path');

const EM_DASH = '—';

// Directories that never hold source copy.
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.vercel',
  'coverage',
  'playwright-report',
  'test-results',
]);

let fileCache = null;

function allFiles() {
  if (fileCache) return fileCache;
  const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = dir === '.' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  fileCache = walk('.');
  return fileCache;
}

// Expand a glob supporting `*` (one path segment) and `**` (any depth).
function expandGlob(glob) {
  const pattern = glob
    .split('/')
    .map((seg) =>
      seg === '**'
        ? '.*'
        : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
    )
    .join('/')
    .replace(/\.\*\//g, '(?:.*/)?');
  const rx = new RegExp(`^${pattern}$`);
  return allFiles().filter((p) => rx.test(p));
}

// Blank out HTML comments, preserving line numbers.
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

// Blank out `/* ... */` comments only. CSS has no line comments, and a bare
// `//` there is part of a url(https://...), so it must not be treated as one.
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

// Blank out JS/TS line and block comments, which also covers JSX {/* ... */}.
// Tracks string and template literals so that the `//` in a URL such as
// 'https://relavoi.com' is not mistaken for the start of a comment.
function stripJsComments(text) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (quote) {
      if (c === '\\') { out += c + (next || ''); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i += 1; continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (; i < stop; i += 1) out += text[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

function scrub(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css') return stripCssComments(text);
  if (ext === '.html' || ext === '.htm') return stripHtmlComments(text);
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    return stripJsComments(stripHtmlComments(text));
  }
  return text;
}

function main() {
  const files = [...new Set(COVERED_GLOBS.flatMap(expandGlob))].sort();
  const findings = [];

  for (const file of files) {
    const scrubbed = scrub(file, fs.readFileSync(file, 'utf8'));
    scrubbed.split('\n').forEach((line, idx) => {
      if (line.includes(EM_DASH)) {
        findings.push({ file, line: idx + 1, text: line.trim() });
      }
    });
  }

  if (findings.length === 0) {
    console.log(`No em dashes in user-facing copy. Checked ${files.length} files.`);
    return 0;
  }

  const plural = findings.length === 1 ? '' : 'es';
  console.error(`Found ${findings.length} em dash${plural} in user-facing copy:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.text.slice(0, 160)}`);
  }
  console.error(
    '\nRewrite each one with a comma, a colon, a full stop or parentheses.\n' +
      'For an empty value in a table, card or field use "None" or "Not set".\n' +
      'Do not substitute a hyphen (-) or an en dash (–).'
  );
  return 1;
}

try {
  process.exit(main());
} catch (err) {
  console.error(`check-em-dashes: ${err.message}`);
  process.exit(2);
}
