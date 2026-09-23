import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/*
One rule only: rules-of-hooks.

Not laziness. This project's style is set by people and by review, and rolling out a full lint ruleset would only
stuff every commit with warnings that would not make anything better, after which everyone learns to ignore them --
and once ignoring starts, the one that actually matters gets ignored along with the rest.

rules-of-hooks is different: it catches a class of error that is **statically decidable, takes the whole page down,
and is extremely hard to spot by eye**. We hit it once -- a useEffect placed after an early return, harmless most of
the time, running one hook fewer only on the "the trading terms and this version's supported coins do not intersect"
branch, at which point React threw "Rendered fewer hooks than expected" and the console went blank. Reading through
the file did not find it, two versions of a regex did not find it, and installing this rule pointed at it in a second.

Other rules can be added at any time, but ask first: is the error it catches worth everyone glancing at on every build?
*/
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  {
    /* The `eslint-disable-next-line react-hooks/exhaustive-deps` lines in the code are written for people:
       they say "this dependency is deliberately omitted", with the reason in the comment beside them. We do not
       have exhaustive-deps enabled, so eslint calls them "unused" -- seven lines of noise scrolling past on every
       build, and with enough noise the one that matters gets skipped along with it. */
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
]
