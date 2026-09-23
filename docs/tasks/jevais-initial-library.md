# Task brief: jevais v0.1.0 — initial library

Status: approved in conversation (2025 session; rankMeaning returns plain T[] per operator)

## Outcome and boundaries

Build the `jevais` npm package: a zero-runtime-dependency TypeScript library of
small semantic functions on top of the TypeSafe Jev HTTP API. All functions
share one HTTP client (native `fetch`), one auth/config mechanism, bounded
concurrency, and one threshold convention. Every function throws on API,
network, timeout, or malformed-response failure; no function ever converts a
failure into a "no" or an empty result.

Public API (exact signatures in `.tinysdd/tasks/jevais-initial-context.md`):

- `configure(options)` — optional module-level config: `apiKey`, `model`,
  `timeoutMs`, `retries`. `TYPESAFE_API_KEY` env is the default key source.
  Default model: `jev-latest`.
- `ifjev(question, state, threshold = 0.85)` → `Promise<boolean>`. True when
  P(yes) ≥ threshold. One Noul question, one request.
- `findMeaning(items, question, opts?)` → `Promise<T | undefined>`. First item
  (original order) whose P(yes) ≥ threshold. One Noul question per item,
  per-item request, bounded concurrency.
- `partitionMeaning(items, question, opts?)` → `Promise<{ yes, no, uncertain }>`.
  `p ≥ t` → yes, `p ≤ 1 − t` → no, otherwise uncertain. Same request pattern
  as findMeaning.
- `rankMeaning(items, levels, opts?)` → `Promise<T[]>` sorted by score
  descending, stable for ties. One Score question per item, identical rubric
  for every item. Returns the items only, no scores (operator decision).
- `changedMeaning(before, after, question, opts?)` → `Promise<boolean>`. One
  Noul question over structured state `{ before, after }`.

Empty input arrays return empty/`undefined` results without calling the API.

Out of scope: choice-based routing helpers, streaming, caching, workflow
engines, CLI, plugins, CJS dual build. Nothing else in the repo is touched
(README.md is replaced; transcript.md stays as-is).

## Sources and open decisions

- `transcript.md` (approved in prior session): name `jevais`; five functions
  (ifjev + find/partition/rank/changedMeaning); zero dependencies; native
  fetch; uncertain judgments explicit (never silently "no"); network failures
  throw; README with one example per function; publish CI; Luna worker.
- https://docs.typesafe.ai/api.md: endpoint `POST https://api.typesafe.ai/v1/systemone`,
  `Authorization: Bearer`, request `{ state, model, questions }`, answer shapes
  (`noul` number; `score` + legend + probabilities + confidence), Score 2–10
  levels, errors 401/422/429/529.
- `/home/ivo/workspace/postgram/docs/superpowers/jev-research-decision.md`:
  verified usage of the same API; jaggedness limits (no math/counting/dates,
  minimal state, English primary) — per-item state isolation is the reason for
  one request per item instead of shared-state batching.
- npm registry (checked today): `jevais` and `ifjev` both unclaimed (404).
- Proposed decision — tooling: vitest (never jest), ESLint flat + typescript-eslint,
  Prettier, strict tsc, ESM-only (`"type": "module"`), Node engines `>= 20`.
  Matches Ivo's current repos (talon, postgram).
- Proposed decision — retry: on 429/529 retry up to 3 attempts with
  exponential backoff, honoring `Retry-After` when present. Default request
  timeout 30 s via `AbortSignal.timeout`.
- Proposed decision — license MIT; version 0.1.0; publish workflow triggers on
  tag push `v*` using npm trusted publishing (OIDC, `--provenance`); CI
  (lint + typecheck + test) on push/PR to main.
- Resolved decision — `rankMeaning` returns plain `T[]`; the operator chose
  this over returning `{ item, score }` pairs.
- UNKNOWN: TypeSafe docs do not state a max questions-per-request or rate
  limit. Mitigated by design (one request per item, bounded concurrency), no
  batching added in v0.1.0.

## Acceptance and checks

| Situation | Expected result and preserved state | Source or approved decision | Exact check |
| --- | --- | --- | --- |
| `ifjev` with mocked fetch returning `noul: 0.9`, threshold 0.85 | resolves `true`; request body has 1 noul question, Bearer key, model `jev-latest` | brief | `npm test` (vitest, fetch stubbed; no real inference) |
| `ifjev` with `noul: 0.5`, threshold 0.85 | resolves `false`; no error swallowed | brief | `npm test` |
| fetch rejects / 401 / 422 / malformed response body | throws; message includes status or cause | transcript "network failures throw" | `npm test` |
| 429 then 200 (Retry-After honored) | retries, then resolves; no throw | proposed decision | `npm test` |
| `partitionMeaning` with p = 0.9 / 0.1 / 0.5, t = 0.85 | `{ yes: [a], no: [b], uncertain: [c] }` | transcript "uncertain is explicit" | `npm test` |
| `partitionMeaning` with empty array | `{ yes: [], no: [], uncertain: [] }`, zero fetch calls | brief | `npm test` |
| `findMeaning` with items 3 and 5 matching | returns item 3 (first in order), regardless of completion order | brief | `npm test` |
| `rankMeaning` 3 items, scores 1.2 / 0.8 / 1.2 | sorted desc, stable tie order; identical rubric sent for each item | transcript "same rubric every item" | `npm test` |
| `changedMeaning(before, after)` high noul | `true`; state is `{ before, after }` | brief | `npm test` |
| Concurrency cap 4 | max 4 in-flight fetches for 10 items | proposed decision | `npm test` |
| Build + lint + typecheck | `npm run build`, `npm run lint`, `npm run typecheck` pass, strict TS, no runtime deps in package.json | ivo-code-style, zero-dep scope | commands run |
| Publish workflow | publish.yml uses OIDC (`id-token: write`, `--provenance`), triggers on `v*` tag, runs on ubuntu-latest with Node 20 | proposed decision | workflow file inspection (not executed) |
| README | one working example per function + auth quickstart | transcript | read |

Test-writing approval needed: tests mock `globalThis.fetch` via vitest stubs;
no test calls the real TypeSafe API. Verification limitation: publish.yml and
npm OIDC cannot be exercised until the operator configures a trusted publisher
at npmjs.com; the first publish may need to be manual `npm publish`.

## Expected changes and stop conditions

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`,
  `.prettierrc`, `.gitignore`, `.npmrc`, `LICENSE`, `README.md`: package
  scaffolding and docs.
- `src/index.ts` (public exports), `src/client.ts` (HTTP client, auth, retry,
  timeout, response validation), `src/meaning.ts` (the five functions,
  concurrency): implementation.
- `tests/ifjev.test.ts`, `tests/meaning.test.ts`, `tests/client.test.ts`:
  vitest behavior tests against a stubbed fetch.
- `.github/workflows/ci.yml`, `.github/workflows/publish.yml`: CI and OIDC
  publish on `v*` tag.
- Stop and ask if: the TypeSafe API contract differs from the documented
  shape; any function needs more than the agreed knobs; the worker wants to
  add a dependency; tests would need real inference; publishing needs a
  secret (should be secretless via OIDC).

## Approval and handoff

Approval: operator chose "Approve, plain rankMeaning" in conversation (all
listed decisions approved, with rankMeaning returning plain T[]).

Division of labor: implementation runs as two sequential TinySDD CLI worker
dispatches on worker `titan` (Pi with litellm/titan/llamacpp/qwen3.8-q4s-256k,
profile `profiles/titan-qwen38.json`, thinking high — tested live this
session). The sandbox allows read/write/edit only; it returns disposable
candidates and patches. Task split (15-minute hard run cap on this model):

1. `jevais-initial`: package scaffolding + src/* (types, client, meaning,
   index). Outer-agent verification: npm install, lint, typecheck, build,
   and a node import smoke check of dist.
2. `jevais-tests` (depends on 1): tests/*, README.md, CI and publish
   workflows. Outer-agent verification: full npm test plus workflow file
   inspection.

After each dispatch the outer agent reviews the candidate patch, applies
reviewed changes, verifies in this environment, records evidence in
docs/reviews/jevais-initial.md, and records acceptance via `tinysdd task
review`. The worker cannot commit, push, run tests, or reach the network
beyond the model endpoint. The model serves one concurrent session only;
nothing else may call titan during a dispatch.

Prior attempt note: one dispatch to the harness worker implementation-gpt-5.6-luna-max
failed at launch with an infrastructure error (provider usage limit reached).
No files were produced; the operator redirected to the titan worker. One
subsequent titan dispatch was interrupted by the controller at the operator's
instruction (wrong thinking level); no usable candidate.

Evidence: none yet (no code written).

Remaining work or concerns: npm trusted-publisher setup on npmjs.com is an
operator step before the first OIDC publish; first publish can be manual.