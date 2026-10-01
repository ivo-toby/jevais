# Self-review: configurable endpoint and Ollaya compatibility

- TinySDD task: `jevais-ollaya-endpoint`
- Reviewer: implementation agent (self-review; user should review the diff)
- Verdict: accepted by self-review; no independent review or live-server
  verification was performed.

## Changes reviewed

- `src/types.ts`: added `JEV_BASE_URL` and `JevaisOptions.baseUrl`; documented
  base URL and retry behavior.
- `src/client.ts`: resolves base URL as per-call > `configure()` >
  `TYPESAFE_BASE_URL` > default, strips trailing slashes, and appends
  `/v1/systemone`; includes HTTP 503 in the existing retry policy.
- `tests/client.test.ts`, `tests/ifjev.test.ts`: cover environment/per-call/
  module precedence, path normalization, Ollaya-shaped Noul and Score
  responses, and 503 retry delay/exhaustion. Existing default endpoint test
  explicitly clears the base URL environment setting.
- `README.md`: documents the option, precedence, Ollaya model/key setup, and
  retried statuses.

No runtime dependencies, provider detection, model default changes, or native
Ollaya `/api/*` support were added.

## TDD and verification evidence

RED, before production changes:

- `npm test -- tests/client.test.ts tests/ifjev.test.ts`
- Result: 7 intended failures / 20 passes in `client.test.ts`, 6 passes in
  `ifjev.test.ts`. Failures showed hard-coded endpoint usage and 503 being
  treated as terminal (one attempt rather than a retry).

GREEN, after implementation:

- `npm test -- tests/client.test.ts tests/ifjev.test.ts`: 27/27 passed.
- Final `npm run format:check`: passed.
- Final `npm run lint`: passed.
- Final `npm run typecheck`: passed (source and tests).
- Final `npm test`: 42/42 passed (3 files).
- Final `npm run build`: passed.
- `git diff --check`: passed.

Tests stub `globalThis.fetch`; no external Ollaya server was contacted. The
response fixtures follow Ollaya's documented System One envelope. Live Ollaya
startup/model behavior remains unverified.

## Review findings and residual risk

- No out-of-scope source changes or regressions found in self-review.
- Ollaya callers still need to select a model present on their server and
  provide a non-empty key (matching `OLLAYA_API_KEY` if configured).
- The default model remains `jev-latest`, and default timeout remains 30s; a
  cold local model may need an increased `timeoutMs` or explicit warm-up.
- npm packaging/version was not changed and `npm pack --dry-run` was not run
  for this source-only change.
