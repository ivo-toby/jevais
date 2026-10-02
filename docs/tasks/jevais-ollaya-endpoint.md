# Task brief: configurable endpoint and Ollaya compatibility

Status: approved in conversation — implementation and test changes authorized.

## Outcome and boundaries

Allow callers to direct the existing TypeSafe System One client to another
wire-compatible server, including Ollaya, while preserving TypeSafe as the
default. Resolve the base URL in this order: per-call `baseUrl`, the latest
value set by `configure({ baseUrl })`, `TYPESAFE_BASE_URL`, then the built-in
default `https://api.typesafe.ai`. Append `/v1/systemone` to the selected base
URL, normalizing trailing slashes so the route appears exactly once.

Keep the current request path, payload, Bearer authentication, answer
validation, public semantic-function signatures, default model (`jev-latest`),
API-key requirement, timeout, and retry count unchanged, except for the
approved 503 retry behavior below. Ollaya users must supply a model that exists
on their server (for example `winnow:e4b` or `laya`) through the existing
`model` option or `configure()`; do not add provider detection or automatically
change the model. Ollaya accepts any non-empty key unless its server is
configured with `OLLAYA_API_KEY`, so callers can use a matching key or a local
placeholder such as `local`.

No new runtime dependencies, provider abstraction, model-listing API, Ollaya
native `/api/*` support, or package/version/release changes.

## Sources and approved decisions

- `src/types.ts` (`JEV_ENDPOINT`, `JevaisOptions`, `MeaningOptions`,
  `RankOptions`): endpoint is currently a fixed full URL; `JevaisOptions` is
  inherited by all options-bearing semantic functions.
- `src/client.ts` (`moduleConfig`, `configure`, `resolveConfig`, `postJev`):
  configuration currently merges module defaults with per-call options; API
  key falls back to `TYPESAFE_API_KEY`; `postJev` owns the shared fetch path.
- `tests/client.test.ts`, `tests/ifjev.test.ts`: client tests cover API key and
  model precedence; `ifjev.test.ts` asserts the hard-coded URL.
- `README.md` Auth/options section: documents current options and key setup.
- Ollaya [TypeSafe compatibility](https://ollaya.dev/docs/typesafe-compatibility)
  and [API](https://ollaya.dev/docs/api): documents `TYPESAFE_BASE_URL`,
  `POST /v1/systemone`, TypeSafe-compatible request/response envelopes,
  `noul`/`score` question types, Bearer key behavior, and `503 QUEUE_FULL` with
  `Retry-After: 1`.
- **Approved in conversation:** expose `baseUrl` (the origin or base path,
  without `/v1/systemone`) and use `TYPESAFE_BASE_URL`, matching Ollaya's
  documentation.
- **Approved in conversation:** add HTTP 503 to retryable statuses, since
  Ollaya uses it for transient queue saturation. Reuse the current retry
  count/backoff and numeric `Retry-After` handling; leave 429/529 unchanged.
- **Test-writing permission:** user approved implementation as written,
  including changing tests, in the approval handshake.

## Acceptance and checks

| Situation | Expected result and preserved state | Source or approved decision | Exact check |
| --- | --- | --- | --- |
| No base URL option/config/env is set | Requests still go to `https://api.typesafe.ai/v1/systemone`. Existing defaults and request bytes remain unchanged. | `src/types.ts`; approved default-preservation requirement | Client test asserts URL and payload; full test suite |
| Per-call base URL is set | Request uses `<baseUrl>/v1/systemone`; per-call setting wins over module config and environment. | Existing per-call-over-config precedence in `src/client.ts`; approved `baseUrl` decision | Client tests cover URL and precedence |
| `configure({ baseUrl })` is set | Later configure calls merge as today; configured URL is used unless overridden per call. | `configure()` behavior in `src/client.ts` | Client test covers merge and per-call override |
| Only `TYPESAFE_BASE_URL` is set | Environment base URL is used before the default; trailing slash(es) do not duplicate the route separator. | Ollaya compatibility docs; approved precedence | Client tests cover env fallback and slash normalization |
| Ollaya-compatible `noul` and `score` responses are returned | Existing semantic results parse unchanged; response `model` may be Ollaya's canonical model name and remains accepted as a string. | Ollaya API docs; current `validateResponse`, `askNoul`, `askScore` | Tests use Ollaya-shaped envelopes and exercise both answer types |
| Ollaya reports transient `503 QUEUE_FULL` with numeric `Retry-After` | Retry within the existing retry budget and honor the indicated delay; exhaustion still throws `JevError` with HTTP status/body. | Approved 503 behavior; existing `retryDelayMs()` behavior | Fake-timer test for retry, delay, and exhaustion |
| Existing TypeSafe behavior | Auth header, payload, model default, timeout, 429/529 retries, errors, and empty-input short-circuits remain unchanged. | Current source and tests | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` |

Test-writing permission is approved as part of the implementation scope.

## Expected changes and stop conditions

- `src/types.ts`: add `baseUrl` to `JevaisOptions`; document its precedence and
  default/base-URL semantics. Because `MeaningOptions` and `RankOptions` extend
  `JevaisOptions`, they inherit it.
- `src/client.ts`: add base URL to module config and resolved config; merge it
  in `configure()`; resolve per-call > configured > `TYPESAFE_BASE_URL` >
  default; build the single System One URL centrally in `postJev`.
- `tests/client.test.ts`, `tests/ifjev.test.ts`: cover URL default/override,
  configuration precedence and the Ollaya-compatible response/retry cases.
- `README.md`: document the base URL setting and an Ollaya example that also
  supplies an Ollaya model and a non-empty API key.
- `docs/tasks/jevais-ollaya-endpoint.md`: task brief and implementation
  record. No other files are expected unless scope changes.
- Stop and ask if the documented wire compatibility proves insufficient,
  the observable response contract differs from the specification, or a
  required fact changes during implementation.

## Approval and handoff

Approval: user approved this spec as written and authorized implementation,
including test changes, through the decision handshake in this conversation.

Evidence: `docs/reviews/jevais-ollaya-endpoint.md` records the TDD red result,
self-review, and final checks. Ollaya's official docs describe the compatible
route and schemas linked above.

Remaining work: implementation and checks are complete. A live Ollaya-server
smoke test was not run; the documented wire shapes were covered by local
fetch-stub tests.
