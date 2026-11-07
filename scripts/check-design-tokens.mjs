#!/usr/bin/env node
/**
 * Fail the build on a colour or a font that is not a brand token.
 *
 * Why this exists: the brand pass moved every surface onto the tokens, and two
 * #5BC97A strokes survived in the analytics line chart because the eye reads a
 * green line as a green line. A grep does not.
 *
 * What counts as the palette: the values declared inside the :root and
 * `@theme` blocks of src/app/globals.css. NOT the whole file.
 *
 *   node scripts/check-design-tokens.mjs
 *   node scripts/check-design-tokens.mjs --strict
 *
 * A literal is allowed when its value IS a declared token. Recharts paints to
 * SVG attributes and cannot read a CSS variable through them, so the chart
 * palette is necessarily written as values; this keeps those values honest.
 */

const TOKEN_FILES = ['src/app/globals.css'];
const ALLOWED_FONTS = ['Sora', 'IBM Plex Mono'];
const EXTENSIONS = ['.css', '.tsx', '.ts', '.jsx', '.svg'];
const IGNORE = ['node_modules/', '.next/', 'src/app/fonts/', 'playwright-report/',
                'test-results/', 'coverage/', 'scripts/'];

const CHECK_UTILITIES = true;

// A Tailwind colour family we deliberately have not re-pointed, with the
// reason it stays.
const ALLOWED_UTILITY_FAMILIES = {
  // The fourth CATEGORICAL accent on the plan badges and pricing dots, beside
  // sky and signal. The brand has no fourth accent, and folding it into info
  // would render GROWTH and SCALE the same colour. Picking one is a palette
  // decision and belongs to Genesis, not to this check.
  violet: "4th categorical accent on plan badges; no brand equivalent yet",
};

const ALLOWLIST = {};

/* ------------------------------------------------------------------ *
 * Nothing below here is repo specific.
 * ------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const strict = process.argv.includes('--strict');

/* Colour parsing ---------------------------------------------------- */

const expand = (h) => (h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6));
const keyOf = (r, g, b) => `${r},${g},${b}`;

function hexKey(hex) {
  const h = expand(hex.replace('#', '').toLowerCase());
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return keyOf(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
}
function rgbKey(args) {
  const n = args.split(/[\s,/]+/).filter(Boolean).slice(0, 3)
    .map((v) => (v.endsWith('%') ? Math.round((parseFloat(v) / 100) * 255) : Math.round(parseFloat(v))));
  if (n.length < 3 || n.some((v) => !Number.isFinite(v))) return null;
  return keyOf(...n);
}

// Every colour literal in a chunk of text, with its 1-based line number.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FN = /\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/g;

function* colours(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A mask-image gradient's colour is an alpha stencil, not a paint: the
    // hex is meaningless as a colour and must not be a token.
    const isMask = /(^|[;{\s])(-webkit-)?mask(-image)?\s*:/.test(line);
    for (const m of line.matchAll(HEX)) {
      if (isMask) continue;
      const k = hexKey(m[0]);
      if (k) yield { line: i + 1, raw: m[0], key: k, fn: 'hex', text: line.trim() };
    }
    for (const m of line.matchAll(FN)) {
      // grab the balanced-ish argument list
      const rest = line.slice(m.index + m[0].length);
      const close = rest.indexOf(')');
      const args = close === -1 ? rest : rest.slice(0, close);
      const fn = m[1].toLowerCase();
      if (args.includes('var(')) continue; // derived from a token at runtime
      if (!/\d/.test(args)) continue;      // prose mentioning "rgb()", not a colour
      const key = fn === 'rgb' || fn === 'rgba' ? rgbKey(args) : null;
      yield { line: i + 1, raw: `${fn}(${args})`, key, fn, text: line.trim() };
    }
  }
}

/* Utility classes ---------------------------------------------------- *
 * A Tailwind colour utility is not a literal, so the scan above cannot see
 * it. bg-red-500 rendered Tailwind own red until the brand families were
 * declared in the token file. A utility whose family is NOT declared there
 * still falls through to Tailwind defaults, so it is a finding.
 * ------------------------------------------------------------------- */

const UTIL = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|shadow|accent|caret|divide|placeholder)-([a-z]+)-(\d{2,3})\b/g;

function* utilities(text) {
  if (!CHECK_UTILITIES) return;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(UTIL)) {
      const [, family, step] = m;
      if (families.has(family)) continue;          // one of ours
      if (ALLOWED_UTILITY_FAMILIES[family]) continue;
      if (!TAILWIND_FAMILIES.has(family)) continue; // not a colour at all
      yield { line: i + 1, raw: m[0], family, step, text: lines[i].trim() };
    }
  }
}

const TAILWIND_FAMILIES = new Set([
  'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo',
  'violet', 'purple', 'fuchsia', 'pink', 'rose',
]);

/* Font parsing ------------------------------------------------------ */

const FONT = /(?:font-family\s*:|fontFamily\s*:)\s*([^;}\n]+)/g;
const GENERIC = new Set([
  'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto',
  'helvetica neue', 'helvetica', 'arial', 'sans-serif', 'serif', 'monospace',
  'ui-monospace', 'ui-sans-serif', 'sfmono-regular', 'sf mono', 'menlo',
  'consolas', 'liberation mono', 'courier new', 'courier', 'noto color emoji',
  'apple color emoji', 'segoe ui emoji', 'inherit', 'initial', 'unset', 'revert',
]);

function* fonts(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(FONT)) {
      const value = m[1].trim().replace(/['"`,]+$/, '');
      if (value.startsWith('var(')) continue;
      for (const fam of value.split(',')) {
        const name = fam.trim().replace(/^['"`]|['"`]$/g, '').trim().toLowerCase();
        if (!name || name.startsWith('var(')) continue;
        if (/^[a-z][\w-]*\s*:/i.test(name)) break; // next JS property, not a family
        if (/^[\d.]+$/.test(name)) continue;
        if (GENERIC.has(name)) continue;
        if (ALLOWED_FONTS.some((f) => f.toLowerCase() === name)) continue;
        yield { line: i + 1, name: fam.trim(), text: lines[i].trim() };
      }
    }
  }
}

/* The allowed palette: values DECLARED inside the token blocks --------- */

function tokenBlocks(text) {
  // :root{...}, [data-theme=...]{...}, @theme ...{...}
  const out = [];
  const re = /(:root|\[data-theme[^\]]*\]|@theme[^{]*)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = re.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    out.push([m.index, i]);
  }
  return out;
}

const allowed = new Set();
const declaredIn = new Map();
const families = new Set();   // "red" from --color-red-500, for the utility rule
for (const rel of TOKEN_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`token file missing: ${rel}`);
    process.exit(2);
  }
  const text = fs.readFileSync(abs, 'utf8');
  const blocks = tokenBlocks(text);
  if (!blocks.length) {
    console.error(`no :root / @theme block found in ${rel}`);
    process.exit(2);
  }
  for (const [s, e] of blocks) {
    const block = text.slice(s, e);
    for (const c of colours(block)) {
      if (c.key) { allowed.add(c.key); if (!declaredIn.has(c.key)) declaredIn.set(c.key, rel); }
    }
    for (const m of block.matchAll(/--color-([a-z]+)-\d+\s*:/g)) families.add(m[1]);
  }
}

/* Walk ---------------------------------------------------------------- */

let files;
try {
  files = execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split('\0').filter(Boolean);
} catch {
  console.error('not a git checkout; this check reads the tracked file list');
  process.exit(2);
}

const scanned = files.filter((f) =>
  EXTENSIONS.some((x) => f.endsWith(x)) &&
  !IGNORE.some((p) => f === p || f.startsWith(p)));

const findings = [];
const inline = [];
let checkedFiles = 0;

for (const rel of scanned) {
  const reason = ALLOWLIST[rel];
  if (reason) continue;
  const abs = path.join(ROOT, rel);
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  checkedFiles++;

  // In a token file, only the region OUTSIDE the token blocks is checked:
  // the blocks are the declaration, everything else is a consumer.
  let body = text;
  if (TOKEN_FILES.includes(rel)) {
    const blocks = tokenBlocks(text);
    let out = '';
    let prev = 0;
    for (const [s, e] of blocks) {
      out += text.slice(prev, s) + text.slice(s, e).replace(/[^\n]/g, ' ');
      prev = e;
    }
    body = out + text.slice(prev);
  }

  for (const c of colours(body)) {
    if (c.key === null) {
      findings.push({ rel, line: c.line, kind: 'colour-space',
        detail: `${c.raw} is not a token: the palette is declared in hex and rgb, so a ${c.fn}() literal cannot be one`,
        text: c.text });
    } else if (!allowed.has(c.key)) {
      findings.push({ rel, line: c.line, kind: 'colour',
        detail: `${c.raw} (rgb ${c.key}) is not a declared token value`, text: c.text });
    } else if (strict) {
      inline.push({ rel, line: c.line, detail: `${c.raw} is the token declared in ${declaredIn.get(c.key)}, written inline` });
    }
  }
  for (const u of utilities(body)) {
    findings.push({ rel, line: u.line, kind: 'utility',
      detail: `${u.raw} resolves to Tailwind own ${u.family}, not a brand token: ` +
              `--color-${u.family}-${u.step} is not declared in the token file`,
      text: u.text });
  }
  for (const f of fonts(body)) {
    findings.push({ rel, line: f.line, kind: 'font',
      detail: `font "${f.name}" is not one of: ${ALLOWED_FONTS.join(', ')}`, text: f.text });
  }
}

/* Report --------------------------------------------------------------- */

const allowCount = Object.keys(ALLOWLIST).length;
if (findings.length === 0) {
  console.log(`Design tokens OK: ${checkedFiles} files checked against ${allowed.size} token values ` +
              `from ${TOKEN_FILES.join(', ')}` + (allowCount ? `, ${allowCount} allowlisted` : ''));
  if (strict && inline.length) {
    console.log(`\n${inline.length} token values written inline rather than as var() (not a failure):`);
    for (const i of inline.slice(0, 60)) console.log(`  ${i.rel}:${i.line}  ${i.detail}`);
  }
  process.exit(0);
}

console.error(`Design token check failed: ${findings.length} literal(s) outside the token files.\n`);
let last = null;
for (const f of findings) {
  if (f.rel !== last) { console.error(`  ${f.rel}`); last = f.rel; }
  console.error(`    line ${f.line}: ${f.detail}`);
  if (f.text && f.text.length < 160) console.error(`      ${f.text}`);
}
console.error(`
Every colour must be a value declared in a token block (:root, [data-theme], @theme)
of: ${TOKEN_FILES.join(', ')}
Every font must be one of: ${ALLOWED_FONTS.join(', ')}
Every colour utility must name a family declared in that token file.

Add the colour to the token file and reference it, or, if the literal genuinely
has to stay, add the path to ALLOWLIST in this script with the reason.`);
process.exit(1);
