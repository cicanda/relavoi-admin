import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// Next 16 removed `next lint`, so ESLint runs directly. eslint-config-next 16
// ships native flat configs and is imported as-is; FlatCompat cannot load it
// (it throws on a circular plugin reference) and is not needed.
//
// Errors fail the build, warnings do not. That is plain `eslint` behaviour
// with no --max-warnings, and it is deliberate: a warning here is advice, and
// a gate that blocks on advice is a gate someone switches off.
export default [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // The copy guard and the SDK version check are CommonJS Node scripts, run
    // by `node check-em-dashes.js` and by CI, never bundled. `require` is
    // correct there, so the TypeScript-oriented rule does not apply.
    files: ['*.js', 'scripts/**/*.{js,mjs}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    /**
     * `set-state-in-effect` from eslint-plugin-react-hooks 7 fires four times
     * here, all the same pattern: a console screen syncing fetched data into
     * component state from an effect. Audit does it twice, fleet and tenant
     * detail once each. Real, in that React can render the intermediate state,
     * and all four are ours rather than Genesis's.
     *
     * Fixing them means changing how those screens hold their data, which is
     * a behaviour change to the console and does not belong in the commit that
     * introduces linting. Warnings so they stay visible and counted, rather
     * than disabled, which would hide them, or errors, which would land the
     * gate red. Listed in docs/backlog.md.
     *
     * `purity` is carried for the same reason as the dashboard's config, so
     * the two repos have one policy; nothing in this repo trips it today.
     */
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
