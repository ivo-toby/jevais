# Review — jevais-initial (core implementation)

- Task: `jevais-initial` (worker `titan`, model `litellm/titan/llamacpp/qwen3.8-q4s-256k`, profile `profiles/titan-qwen38.json`, thinking high)
- Launch: `launch-dc6106b7-cdb6-4435-ac13-98d41e61ee61`, run `worker-2026-09-22T17-32-26-733Z-0a1e429a`
- Outcome: `completed`, 34 min, 15 tool calls, 0 scope violations
- Reviewer: outer agent (pi controller)

## Candidate scope

12 files created, all within the allow list:

- Scaffolding: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `.npmrc`, `LICENSE`
- Sources: `src/types.ts`, `src/client.ts`, `src/meaning.ts`, `src/index.ts`

Out of scope and untouched: tests, README, workflows (phase 2, task `jevais-tests`), plus `transcript.md`, `.tinysdd/`, `docs/`, `profiles/`.

## Check run

Verified in a disposable copy before applying (`npm install`, then):

| Check | Result |
| --- | --- |
| `npm run lint` (eslint flat, js + ts recommended) | pass |
| `npm run typecheck` (tsc --noEmit, strict) | pass after review fix |
| `npm run build` (tsc, declarations + maps) | pass after review fix |
| Behavioral smoke (stubbed `fetch`, node REPL) | pass |

Smoke details: 12 POSTs to `https://api.typesafe.ai/v1/systemone`, `{state, model, questions}` bodies, Bearer auth; ifjev threshold both sides; findMeaning first-match; partition yes/no/uncertain cutoffs (p≥t / p≤1−t); rankMeaning stable ties, plain `T[]`; empty arrays short-circuit with 0 fetches; invalid `levels` and missing API key throw `JevError` before any fetch.

## Review findings

1. **[fixed] client.ts:184 — invalid cast.** `return data as JevResponse` failed typecheck (`TS2352`, `Record<string, unknown>` needs the `unknown` bridge). Reviewer fix: also validate `model` (string) and `usage` (object) before casting, then `data as unknown as JevResponse`. Re-ran lint, typecheck, build — all pass.
2. **[assumption to confirm] `package.json` repository/author** — worker wrote `git+https://github.com/ivo-toby/jevais.git` and author `ivo-toby`. Confirm the real repo URL before the first publish.
3. `vitest` present but `npm test` intentionally not run yet — no test files exist in this phase; tests arrive with `jevais-tests`.

## Infra notes (outside the code)

- Model constraint: titan serves exactly one concurrent session; earlier probe calls collided with a running dispatch.
- Pi's default `maxTokens` (16384) truncated a thinking-high turn at 15.2k reasoning tokens with no tool call; raised to 65536 on this model entry in `models.personal.json`.
- tinysdd worker caps raised in `/home/ivo/workspace/tiny-sdd` (uncommitted): `MAX_TIMEOUT_MS` 900000 → 3600000 in `src/config.mjs` and `src/pi-environment.mjs`; jevais worker `limits.timeoutMs` set to 3600000.
- Verdict: **accepted**.
- Addendum (phase 2): after `jevais-tests` applied tests/README/workflows, this
  task's allow-list digest went stale (the CLI binds acceptance to the current
  contents of every allow-listed file). Re-accepted against the final tree;
  none of this task's own 12 files changed in phase 2 (verified: identical
  sha256 for all 12 between the phase-1 candidate snapshot and the applied
  tree).
## Addendum 3 (2026-09-22, post review-fixes)

Three fix tasks (`jevais-fix-meta`, `jevais-fix-workflows`,
`jevais-review-fixes`) applied the post-implementation review findings on top
of this task's output: prettier enforcement (.prettierignore + scripts),
test typechecking (tsconfig.test.json), npm ci + permissions + format check
in CI, full check run before npm publish, LICENSE year, publishConfig,
README changedMeaning threshold note, prettier formatting of README/tests,
and the client retries-exhausted grammar fix. `src/` public API is unchanged;
37/37 tests still pass; lint/format/typecheck/build green. Re-recorded
against the final tree.

## Addendum 4 (2026-09-23, post lintignore fix)

`jevais-fix-lintignore` adjusted `eslint.config.js` global ignores
(`**/dist/` + `.tinysdd/`) so local lint stays green with TinySDD run state
present. No library-source change; re-recorded against the final tree.
