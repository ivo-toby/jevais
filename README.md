# jevais

Small semantic functions on top of the [TypeSafe Jev](https://docs.typesafe.ai) API.
Zero runtime dependencies, native `fetch`, strict TypeScript, ESM only (Node >= 20).

Every function makes probability judgments and keeps them honest: a network, API,
timeout, or malformed-response failure throws a `JevError` — it is never converted
into `false` or an empty result — and an uncertain judgment is never silently
treated as `no`.

## Install

```bash
npm install jevais
```

## Auth

The `TYPESAFE_API_KEY` environment variable is the default key source, or set it
once with `configure()`:

```ts
import { configure } from 'jevais';

configure({ apiKey: process.env.TYPESAFE_API_KEY });
```

Every function also accepts these options per call (per-call > `configure()` >
defaults):

| option      | default            | meaning                                                            |
| ----------- | ------------------ | ------------------------------------------------------------------ |
| `apiKey`    | `TYPESAFE_API_KEY` | TypeSafe API key                                                   |
| `model`     | `"jev-latest"`     | model id sent with every request                                   |
| `timeoutMs` | `30000`            | per-attempt request timeout                                        |
| `retries`   | `3`                | retries on HTTP 429/529, exponential backoff, honors `Retry-After` |

## ifjev

One yes/no question over one state. Resolves `true` when P(yes) >= threshold
(default 0.85).

```ts
import { ifjev } from 'jevais';

if (await ifjev('user reacts angry', userResponse, 0.85)) {
  // do thing
}
```

## findMeaning

The first item (original order) whose P(yes) >= threshold, or `undefined`.
One request per item with bounded concurrency (default 4), so completion order
never changes the result.

```ts
import { findMeaning } from 'jevais';

const match = await findMeaning(messages, 'the customer wants to cancel');
if (match) {
  // offer the cancellation flow
}
```

## partitionMeaning

Splits items by P(yes): `p >= threshold` -> `yes`, `p <= 1 - threshold` -> `no`,
the rest -> `uncertain`. Uncertain stays explicit — never silently `no`.

```ts
import { partitionMeaning } from 'jevais';

const { yes, no, uncertain } = await partitionMeaning(
  tickets,
  'the customer explicitly requests a refund',
  { threshold: 0.85 },
);
```

## rankMeaning

Orders items by a Score judgment using the identical 2-to-10-level rubric for
every item; sorted by score descending, stable for ties. Returns the items only.

```ts
import { rankMeaning } from 'jevais';

const ranked = await rankMeaning(feedback, [
  'irrelevant noise',
  'minor, optional improvement',
  'clear, actionable improvement',
  'critical, must fix now',
]);
```

## changedMeaning

Detects a substantive change between two states while ignoring rewording.
One Noul question over the structured state `{ before, after }`.

```ts
import { changedMeaning } from 'jevais';

if (await changedMeaning(oldConfig, newConfig, 'deployment requirements changed')) {
  // redeploy
}
```

Like `partitionMeaning`, it accepts `threshold` through the options object
(default `0.85`).

## askNoul / askScore

The raw JEV primitives behind the functions above. `askNoul` resolves the
probability itself (P(yes) in [0, 1]); `askScore` resolves the full Score
answer (`score`, `confidence`, `legend`, `probabilities`). Use these when you
need the number, not just the threshold decision.

```ts
import { askNoul, askScore } from 'jevais';

const p = await askNoul('Is this a bug?', 'I think this is an error');
if (p >= 0.4) {
  // probable
}

const answer = await askScore('Rate this item.', ['low', 'high'], feedbackText);
console.log(answer.score, answer.probabilities);
```

`askNoul`/`askScore` take the same per-call options as `ifjev` (`apiKey`,
`model`, `timeoutMs`, `retries`).

## Errors

All failures throw `JevError`, which carries the HTTP `status` (when the failure
came from a response) and a raw `body` snippet:

```ts
import { JevError, ifjev } from 'jevais';

try {
  await ifjev('user reacts angry', userResponse);
} catch (error) {
  if (error instanceof JevError) {
    console.error(`jev failed: ${error.status ?? 'network'} - ${error.message}`);
  }
}
```

HTTP 429/529 are retried up to `retries` times with exponential backoff (honoring
`Retry-After` when present); 401, 422, and everything else throw immediately.
Empty item arrays resolve with an empty result without calling the API.

## Notes

- One request per item: every item is judged with its own minimal state, which
  keeps large, irrelevant state from distracting the judge.
- Keep questions literal, in English, and free of math/counting/date logic.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm test
```

## License

MIT
