# Review — jevais-tests (tests, README, CI)

- Task: `jevais-tests` (worker `titan`, model `litellm/titan/llamacpp/qwen3.8-q4s-256k`, thinking high)
- Launch: `launch-70af0ed4-a748-4989-a59a-e798720646ea`, run `worker-2026-09-22T18-10-35-003Z-ecc6ab0a`
- Outcome: `completed`, 47.6 min, 20 tool calls, 0 scope violations
- Reviewer: outer agent (pi controller)

## Candidate scope

- `tests/ifjev.test.ts`, `tests/meaning.test.ts`, `tests/client.test.ts` (37 tests)
- `README.md` — expanded the `# jevais` stub into full docs (tracked file, in-scope change)
- `.github/workflows/ci.yml` (push/PR to main: lint, typecheck, build, test)
- `.github/workflows/publish.yml` (tag `v*`: build, `npm publish --provenance`, `id-token: write` for OIDC)

Out of scope and untouched: `src/` (already accepted in phase 1), scaffolding, `transcript.md`, `.tinysdd/`, `docs/`, `profiles/`.

## Check run

Verified in the same disposable copy as phase 1 (node_modules reused), then applied to the repo:

| Check | Result |
| --- | --- |
| `npm test` (vitest) | 37/37 pass after review fix |
| `npm run lint` | pass (covers tests/) |
| `npm run typecheck` | pass |
| `npm run build` | pass |

All tests stub `globalThis.fetch` via `vi.stubGlobal` — no test performs real inference. Coverage includes: request envelope (endpoint, Bearer auth, `{state, model, questions}`), threshold boundaries (p==t yes, p==1−t no), one-request-per-item with per-item state, bounded concurrency (max 4 in flight, honors option, rejects invalid), empty-input short-circuits with 0 fetches, levels 2–10 guard, `JevError` on 401/422/network/timeout/malformed envelope/malformed answers, retry 429/529 with `Retry-After` and backoff, retries exhausted, and `configure()` merge/precedence.

## Review findings

1. **[fixed] tests/client.test.ts — unhandled rejection in the retries-exhausted test.** The rejection handler was attached only after `vi.advanceTimersByTimeAsync` flushed the retries, so the already-rejected promise surfaced as an unhandled rejection during the run. Reviewer fix: attach `rejectionOf(promise)` before advancing timers. Re-ran the suite — clean.
2. **[note] Tests are not typechecked by `tsc`** (tsconfig `include: ["src"]`); vitest transpiles without type errors. Matches the brief's tsconfig; noted for future improvement (e.g., a test tsconfig) rather than fixed.
3. Phase 1 finding (assumed `repository`/`author` in package.json) still open — confirm the GitHub repo URL before the first publish.

## Infra notes

- Same environment corrections as phase 1 (single titan session, Pi `maxTokens` 65536, tinysdd caps raised to 1 h).
- Verdict: **accepted**.
## Addendum 3 (2026-09-22, post review-fixes)

The review-fix tasks reformatted `tests/client.test.ts` and
`tests/meaning.test.ts` (prettier only — every assertion preserved) and
`src/client.ts` now pluralizes the retries-exhausted message correctly. The
full suite (37/37) passes on the final tree; typecheck now covers tests via
`tsconfig.test.json`. Re-recorded against the final tree.

## Addendum 4 (2026-09-23, post lintignore fix)

No test-file change since addendum 3; `eslint.config.js` ignores were widened
(nested dist + `.tinysdd/`). Suite still 37/37; re-recorded against the
final tree.
