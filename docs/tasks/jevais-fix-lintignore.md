# Task brief: jevais — eslint ignores for nested build output

Operator directive 2026-09-22: "review changes, use the tinySDD worker for
fixes. When no p0, p1, p2 issues remain; commit and push to main."

## Outcome and boundaries

One single-line edit to `eslint.config.js`. Nothing else. No new files, no
new dependencies, no source or test changes.

## Why

`eslint.config.js` declares global `ignores: ['dist/', 'node_modules/',
'coverage/']`. In ESLint flat config, a bare directory pattern like `dist/`
matches only the project-root directory — not nested copies. TinySDD worker
run workspaces under `.tinysdd/runs/*/workspace-*/dist/` contain built JS,
so a local `npm run lint` reports 56 `no-undef` errors from files that are
not library source. CI never sees this (`.tinysdd/` is not committed), but
local verification must be green.

## Efficiency directive (hard requirement)

One edit, one turn. Straight from recipe to execution; no planning pass, no
reformatting beyond the recipe.

## Change (exact)

In `eslint.config.js`, replace the block

```js
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
```

with the block

```js
  {
    ignores: ['**/dist/', 'node_modules/', 'coverage/', '.tinysdd/'],
  },
```

`**/dist/` covers the root and all nested dist directories; `.tinysdd/`
excludes the tooling state entirely.

## Verification

The controller verifies the candidate byte-for-byte and re-runs lint on the
full local tree (with `.tinysdd` present); report your own checks as unrun if
you cannot run them.

## Division of labor

Worker: titan (CLI pi, model `litellm/titan/llamacpp/qwen3.8-q4s-256k`,
thinking high, profile `profiles/titan-qwen38.json`) per operator directive.
The worker produces a candidate and patch in its sandbox and never applies
or commits. The controller (this agent) reviews, verifies, applies, records
the review, and handles git.
