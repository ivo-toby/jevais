# Task brief: jevais v0.1.0 — review fixes (config/scripts layer)

Operator directive 2026-09-22: "review changes, use the tinySDD worker for
fixes. When no p0, p1, p2 issues remain; commit and push to main." This task
covers the config/scripts layer of the review findings; sibling tasks
`jevais-fix-workflows` (CI/publish workflows) and `jevais-review-fixes`
(content layer) cover the rest.

## Outcome and boundaries

Apply the four config-layer findings below to the already-implemented
`jevais` library. No source or test edits at all in this task. No new
dependencies. Only two new files: `.prettierignore` and `tsconfig.test.json`.
Never touch `transcript.md`, `.tinysdd/`, `docs/`, `profiles/`,
`package-lock.json`, `src/`, `tests/`, README.md.

## Efficiency directive (hard requirement)

Your recipes are pre-validated by the controller. Do not re-derive or
re-verify the design decisions in them. Minimize model turns: batch all
independent reads into one turn, batch all edits, and go straight from
recipe to execution. The full task should fit in roughly 6 turns.

## Findings to fix

### M-1: prettier is configured but never enforced — scripts + ignore file

`prettier` is a devDependency and `.prettierrc` exists, but no script runs
it, and there is no `.prettierignore`, so a repo-wide check would scan
non-library files. Fix:

1. Add `.prettierignore` (new file) with exactly these lines:

   ```
   node_modules/
   dist/
   coverage/
   package-lock.json
   transcript.md
   docs/
   .tinysdd/
   profiles/
   LICENSE
   .npmrc
   .gitignore
   ```

   (`LICENSE`, `.npmrc`, `.gitignore` have no prettier parser; the rest are
   not library files. `README.md` and `tests/**` stay IN scope — they must be
   formatted, which is the content-layer task's job, not yours.)

2. In `package.json` scripts add:
   `"format": "prettier --write ."`,
   `"format:check": "prettier --check ."`.

Do NOT run `prettier --write` yourself — the content-layer task formats the
flagged files. Formatting files is out of your scope.

### M-2: tests are excluded from typecheck

`tsconfig.json` has `"include": ["src"]`, so `npm run typecheck` never checks
`tests/`. The tests are strict-tsc clean today (verified by the controller),
so this is pure hardening. Fix:

1. Add `tsconfig.test.json` (new file):

   ```json
   {
     "extends": "./tsconfig.json",
     "compilerOptions": {
       "rootDir": ".",
       "noEmit": true
     },
     "include": ["src", "tests"]
   }
   ```

2. Change the `typecheck` script to
   `"tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json"`.

The controller verified `npx tsc --noEmit --strict --target ES2022 --module
NodeNext --moduleResolution NodeNext --types node src/*.ts tests/*.test.ts`
exits 0, so no test edits are needed and none are allowed.

### M-3: package.json lacks publishConfig access

Add `"publishConfig": { "access": "public" }` to `package.json` (first
publish of a new package must not depend on account defaults).

### M-4: LICENSE year is stale

`LICENSE` says `Copyright (c) 2025 ivo-toby`; the repo work is 2026. Change to
`Copyright (c) 2026 ivo-toby`. No other LICENSE change.

## Out of scope (do NOT fix)

- No CI/workflow edits (sibling task `jevais-fix-workflows`).
- No README/test/src edits (sibling task `jevais-review-fixes`).
- No runtime validation of options bounds; no `Retry-After` HTTP-date
  parsing; no `probabilities` deep validation; no Node matrix; no
  `exports` entry for `./package.json`.

## Verification

After your edits, in your workspace run (if available in your sandbox):
`npm run typecheck` (must pass with both projects) and
`npm run format:check` **will report README.md and tests files as unformatted
— that is expected** and handled by the content-layer task; your own changed
files (`.prettierignore`, `tsconfig.test.json`, `package.json`) must be
prettier-clean. The controller re-verifies everything independently in a
disposable copy before applying; your run is a self-check, not the gate.

## Division of labor

Worker: titan (CLI pi, model `litellm/titan/llamacpp/qwen3.8-q4s-256k`,
thinking high, profile `profiles/titan-qwen38.json`) per operator directive.
The worker produces a candidate and patch in its sandbox and never applies
or commits. The controller (this agent) reviews, verifies, applies, records
the review, and handles git.
