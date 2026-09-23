# Task brief: jevais v0.1.0 — review fixes (content layer, transcription)

Operator directive 2026-09-22: "review changes, use the tinySDD worker for
fixes. When no p0, p1, p2 issues remain; commit and push to main." The
config layer (`jevais-fix-meta`) and workflow layer (`jevais-fix-workflows`)
are applied and accepted. This task is the content layer.

Two prior worker attempts on this task died on model limits (an inference
gateway timeout, then a single reasoning pass that exhausted the model output
budget). The controller therefore computed and fully verified the exact final
content of every changed file (prettier 3 formatting, the README threshold
note, and the retries-exhausted grammar fix; lint, format check, typecheck,
37/37 tests, and build all pass on this exact content). Your job is pure
transcription: produce these exact bytes. There is nothing to design.

## Efficiency directive (hard requirement)

Work incrementally, one write or edit per turn. Do not plan multiple edits in
a single long reasoning pass. Do not reformat, improve, or re-derive anything
you transcribe — copy the target content character for character, including
whitespace, line breaks, quotes, and trailing newlines.

## Changes

1. `src/client.ts` — one edit: replace the block

```
        throw new JevError(`Jev API returned HTTP ${response.status} after ${retry + 1} attempts`, {
          status: response.status,
          body,
        });
```

with the block

```
        throw new JevError(
          `Jev API returned HTTP ${response.status} after ${retry + 1} attempt${retry === 0 ? '' : 's'}`,
          {
            status: response.status,
            body,
          },
        );
```

(This both fixes the "after 1 attempts" grammar and applies prettier's line
wrapping. Nothing else in the file changes.)

2. `package.json`, `README.md`, `tests/client.test.ts`, `tests/meaning.test.ts`
— full-file writes with the exact target content below. `README.md` also
gains one sentence under `changedMeaning` ("Like `partitionMeaning`, it
accepts `threshold` through the options object (default `0.85`)."); the rest
of the differences are prettier formatting only.

#### Target content for `package.json`

````
{
  "name": "jevais",
  "version": "0.1.0",
  "description": "Small semantic functions on top of the TypeSafe Jev API: ifjev, findMeaning, partitionMeaning, rankMeaning, changedMeaning.",
  "keywords": [
    "jev",
    "typesafe",
    "noul",
    "score",
    "llm",
    "semantic",
    "classification",
    "typescript"
  ],
  "license": "MIT",
  "author": "ivo-toby",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ivo-toby/jevais.git"
  },
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "LICENSE",
    "README.md"
  ],
  "sideEffects": false,
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@types/node": "^20.11.0",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.18.0",
    "vitest": "^2.1.9"
  }
}
````

#### Target content for `README.md`

````
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
````

#### Target content for `tests/client.test.ts`

````
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevError, configure, ifjev, rankMeaning } from '../src/index.js';

const API_KEY = 'test-api-key';

interface RecordedCall {
  url: string;
  init: RequestInit;
}

interface SentBody {
  state: unknown;
  model: string;
  questions: Record<string, unknown>;
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sentBody(call: RecordedCall): SentBody {
  return JSON.parse(String(call.init.body)) as SentBody;
}

/** Respond with a valid envelope whose noul answer echoes the request's question id. */
function noulOk(call: RecordedCall, noul: number): Response {
  const id = Object.keys(sentBody(call).questions)[0];
  return okResponse({
    model: 'jev-latest',
    answers: { [id]: { type: 'noul', noul } },
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

function authOf(call: RecordedCall): string {
  return (call.init.headers as Record<string, string>).Authorization;
}

/** Stub globalThis.fetch with vi.stubGlobal and record every call. */
function stubFetch(handler: (call: RecordedCall) => Response | Promise<Response>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call: RecordedCall = { url: String(url), init: init ?? {} };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

/** Resolve to the rejection value; fails the test when the promise resolves. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// NOTE: these describes run in file order. The `configure` describe at the
// bottom mutates module-level state, so it must stay last.

describe('API key resolution', () => {
  it('throws a JevError before any fetch when no key is available', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '');
    const calls = stubFetch((call) => noulOk(call, 0.9));
    const error = await rejectionOf(ifjev('user reacts angry', 'state'));
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).message).toMatch(/API key/i);
    expect(calls).toHaveLength(0);
  });

  it('falls back to the TYPESAFE_API_KEY environment variable', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'env-key');
    const calls = stubFetch((call) => noulOk(call, 0.9));
    await expect(ifjev('user reacts angry', 'state')).resolves.toBe(true);
    expect(authOf(calls[0])).toBe('Bearer env-key');
  });
});

describe('request failures', () => {
  it('throws a JevError carrying status and body snippet on HTTP 401, without retrying', async () => {
    const calls = stubFetch(
      () => new Response(JSON.stringify({ error: 'invalid api key' }), { status: 401 }),
    );
    const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).status).toBe(401);
    expect((error as JevError).body).toContain('invalid api key');
    expect((error as JevError).message).toContain('401');
    expect(calls).toHaveLength(1);
  });

  it('throws a JevError carrying the 422 status and the validation body', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ field: 'questions', error: 'questions must not be empty' }), {
          status: 422,
        }),
    );
    const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).status).toBe(422);
    expect((error as JevError).body).toContain('questions');
    expect((error as JevError).message).toContain('422');
  });

  it('keeps only a snippet of an oversized error body', async () => {
    const longBody = 'x'.repeat(2000);
    stubFetch(() => new Response(longBody, { status: 422 }));
    const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
    expect(error).toBeInstanceOf(JevError);
    const body = (error as JevError).body;
    expect(body).toBeDefined();
    expect(body!.length).toBeLessThan(longBody.length);
    expect(body!.startsWith('x'.repeat(100))).toBe(true);
  });

  it('wraps network failures in a JevError carrying the cause', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).cause).toBeInstanceOf(Error);
    expect((error as JevError).message).toContain('ECONNREFUSED');
  });

  it('throws a JevError for a non-JSON 200 response body', async () => {
    stubFetch(() => new Response('this is not json', { status: 200 }));
    const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).message).toMatch(/malformed/i);
  });

  it('throws a JevError when the response misses required envelope fields', async () => {
    const envelopes: Array<{ label: string; data: unknown }> = [
      { label: 'answers', data: {} },
      {
        label: 'usage',
        data: { model: 'jev-latest', answers: { noul: { type: 'noul', noul: 0.9 } } },
      },
      {
        label: 'model',
        data: {
          model: 42,
          answers: { noul: { type: 'noul', noul: 0.9 } },
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ];
    for (const { label, data } of envelopes) {
      stubFetch(() => okResponse(data));
      const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
      expect(error, label).toBeInstanceOf(JevError);
      expect((error as JevError).message, label).toContain(label);
      vi.unstubAllGlobals();
    }
  });

  it('throws a JevError for malformed noul answers', async () => {
    const badAnswers: Array<{ label: string; answer: unknown }> = [
      { label: 'missing', answer: undefined },
      { label: 'out of range', answer: { type: 'noul', noul: 1.5 } },
      { label: 'not a number', answer: { type: 'noul', noul: 'high' } },
      { label: 'wrong type', answer: { type: 'score', score: 1 } },
    ];
    for (const { label, answer } of badAnswers) {
      stubFetch((call) => {
        const id = Object.keys(sentBody(call).questions)[0];
        return okResponse({
          model: 'jev-latest',
          answers: answer === undefined ? {} : { [id]: answer },
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      });
      const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY }));
      expect(error, label).toBeInstanceOf(JevError);
      expect((error as JevError).message, label).toMatch(/noul/i);
      vi.unstubAllGlobals();
    }
  });

  it('throws a JevError for a malformed score answer (rankMeaning)', async () => {
    stubFetch((call) => {
      const id = Object.keys(sentBody(call).questions)[0];
      return okResponse({
        model: 'jev-latest',
        answers: { [id]: { type: 'score' } },
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    });
    const error = await rejectionOf(rankMeaning(['a'], ['low', 'high'], { apiKey: API_KEY }));
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).message).toMatch(/score/i);
  });

  it('aborts the request after timeoutMs and throws a JevError with the timeout as cause', async () => {
    let seenSignal: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: unknown, init?: RequestInit) => {
        seenSignal = init?.signal;
        const signal = init?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
        });
      }),
    );
    const error = await rejectionOf(ifjev('q', 's', 0.85, { apiKey: API_KEY, timeoutMs: 40 }));
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(error).toBeInstanceOf(JevError);
    const cause = (error as JevError).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).name).toBe('TimeoutError');
  });
});

describe('retries on 429/529', () => {
  it('retries a 429 honoring Retry-After, then resolves on success', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const calls = stubFetch((call) => {
      attempts += 1;
      if (attempts === 1) {
        return new Response('rate limited', { status: 429, headers: { 'Retry-After': '2' } });
      }
      return noulOk(call, 0.9);
    });

    const promise = ifjev('q', 's', 0.85, { apiKey: API_KEY, retries: 3 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe(true);
    expect(attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it('retries 529 with backoff when no Retry-After is present, then resolves', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    stubFetch((call) => {
      attempts += 1;
      return attempts === 1 ? new Response('overloaded', { status: 529 }) : noulOk(call, 0.9);
    });

    const promise = ifjev('q', 's', 0.85, { apiKey: API_KEY, retries: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toBe(true);
    expect(attempts).toBe(2);
  });

  it('throws a JevError with the status after the configured retries are exhausted', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    stubFetch(() => {
      attempts += 1;
      return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
    });

    const promise = ifjev('q', 's', 0.85, { apiKey: API_KEY, retries: 2 });
    // Attach the rejection handler before flushing timers, or the rejection
    // surfaces as an unhandled rejection while timers advance.
    const rejection = rejectionOf(promise);
    await vi.advanceTimersByTimeAsync(60_000);
    const error = await rejection;
    expect(error).toBeInstanceOf(JevError);
    expect((error as JevError).status).toBe(429);
    expect((error as JevError).message).toContain('429');
    expect(attempts).toBe(3);
  });
});

describe('configure', () => {
  it('uses module-level apiKey and model, with per-call options taking precedence', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'env-key');
    configure({ apiKey: 'configured-key', model: 'jev-configured' });
    const calls = stubFetch((call) => noulOk(call, 0.9));

    await ifjev('q', 's', 0.85, { apiKey: 'per-call-key' });
    await ifjev('q', 's', 0.85, { model: 'jev-per-call' });
    await ifjev('q', 's');

    expect(authOf(calls[0])).toBe('Bearer per-call-key');
    expect(sentBody(calls[0]).model).toBe('jev-configured');
    expect(authOf(calls[1])).toBe('Bearer configured-key');
    expect(sentBody(calls[1]).model).toBe('jev-per-call');
    expect(authOf(calls[2])).toBe('Bearer configured-key');
    expect(sentBody(calls[2]).model).toBe('jev-configured');
  });

  it('later configure calls merge over earlier ones', async () => {
    configure({ apiKey: 'configured-key', model: 'jev-later' });
    const calls = stubFetch((call) => noulOk(call, 0.9));
    await ifjev('q', 's');
    expect(authOf(calls[0])).toBe('Bearer configured-key');
    expect(sentBody(calls[0]).model).toBe('jev-later');
  });
});
````

#### Target content for `tests/meaning.test.ts`

````
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JevError,
  changedMeaning,
  findMeaning,
  partitionMeaning,
  rankMeaning,
} from '../src/index.js';

const API_KEY = 'test-api-key';

interface RecordedCall {
  url: string;
  init: RequestInit;
}

interface QuestionShape {
  type: string;
  instructions?: unknown;
  criteria?: unknown;
}

interface SentBody {
  state: unknown;
  model: string;
  questions: Record<string, QuestionShape>;
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sentBody(call: RecordedCall): SentBody {
  return JSON.parse(String(call.init.body)) as SentBody;
}

/** Assert the request carries exactly one question and return it. */
function questionOf(call: RecordedCall): QuestionShape {
  const questions = sentBody(call).questions;
  expect(Object.keys(questions)).toHaveLength(1);
  return Object.values(questions)[0];
}

/** Respond with a valid envelope whose noul answer echoes the request's question id. */
function noulOk(call: RecordedCall, noul: number): Response {
  const id = Object.keys(sentBody(call).questions)[0];
  return okResponse({
    model: 'jev-latest',
    answers: { [id]: { type: 'noul', noul } },
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

/** Respond with a valid score answer for the request's question id. */
function scoreOk(call: RecordedCall, score: number, criteria: readonly string[]): Response {
  const id = Object.keys(sentBody(call).questions)[0];
  const legend: Record<string, string> = {};
  const probabilities: Record<string, number> = {};
  criteria.forEach((level, i) => {
    legend[String(i)] = level;
    probabilities[String(i)] = 0;
  });
  return okResponse({
    model: 'jev-latest',
    answers: {
      [id]: { type: 'score', score, legend, probabilities, confidence: 0.9 },
    },
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

/** Stub globalThis.fetch with vi.stubGlobal and record every call. */
function stubFetch(handler: (call: RecordedCall) => Response | Promise<Response>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call: RecordedCall = { url: String(url), init: init ?? {} };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

function noulFor<T>(probs: ReadonlyMap<T, number>, fallback: number): (state: T) => number {
  return (state) => probs.get(state) ?? fallback;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('findMeaning', () => {
  it('returns the first matching item in original order, regardless of completion order', async () => {
    const calls = stubFetch((call) => {
      const state = sentBody(call).state;
      const noul = state === 3 || state === 5 ? 0.95 : 0.1;
      if (state !== 3) return noulOk(call, noul);
      // Item 3 matches but answers slowly, so item 5 completes first.
      return new Promise((resolve) => {
        setTimeout(() => resolve(noulOk(call, noul)), 30);
      });
    });

    const found = await findMeaning([1, 2, 3, 4, 5], 'the customer wants to cancel', {
      apiKey: API_KEY,
    });

    expect(found).toBe(3);
    expect(calls).toHaveLength(5);

    // One noul request per item, each carrying that item alone as the state.
    const states = calls.map((call) => sentBody(call).state) as number[];
    expect(states.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    for (const call of calls) {
      expect(questionOf(call).type).toBe('noul');
    }
  });

  it('resolves undefined when no item reaches the threshold', async () => {
    const calls = stubFetch((call) => noulOk(call, 0.1));
    await expect(
      findMeaning([1, 2, 3], 'the customer wants to cancel', { apiKey: API_KEY }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(3);
  });

  it('resolves undefined for empty input without calling the API', async () => {
    const calls = stubFetch((call) => noulOk(call, 0.9));
    await expect(
      findMeaning([], 'the customer wants to cancel', { apiKey: API_KEY }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('applies a custom threshold per item', async () => {
    stubFetch((call) => noulOk(call, sentBody(call).state === 2 ? 0.6 : 0.1));
    await expect(
      findMeaning([1, 2, 3], 'the customer wants to cancel', {
        apiKey: API_KEY,
        threshold: 0.5,
      }),
    ).resolves.toBe(2);
  });
});

describe('partitionMeaning', () => {
  it('puts p >= t in yes, p <= 1 - t in no, and the rest in uncertain', async () => {
    const probs = noulFor(
      new Map([
        ['a', 0.9],
        ['b', 0.1],
        ['c', 0.5],
      ]),
      0.5,
    );
    stubFetch((call) => noulOk(call, probs(sentBody(call).state as string)));

    const result = await partitionMeaning(
      ['a', 'b', 'c'],
      'the customer explicitly requests a refund',
      {
        apiKey: API_KEY,
        threshold: 0.85,
      },
    );

    expect(result).toEqual({ yes: ['a'], no: ['b'], uncertain: ['c'] });
  });

  it('keeps p exactly at t in yes and p exactly at 1 - t in no (boundary)', async () => {
    const probs = noulFor(
      new Map([
        ['at-yes', 0.85],
        ['at-no', 0.15],
      ]),
      0.5,
    );
    stubFetch((call) => noulOk(call, probs(sentBody(call).state as string)));

    const result = await partitionMeaning(
      ['at-yes', 'at-no'],
      'the customer explicitly requests a refund',
      {
        apiKey: API_KEY,
        threshold: 0.85,
      },
    );

    expect(result).toEqual({ yes: ['at-yes'], no: ['at-no'], uncertain: [] });
  });

  it('returns three empty arrays for empty input without calling the API', async () => {
    const calls = stubFetch((call) => noulOk(call, 0.9));
    await expect(partitionMeaning([], 'q', { apiKey: API_KEY })).resolves.toEqual({
      yes: [],
      no: [],
      uncertain: [],
    });
    expect(calls).toHaveLength(0);
  });
});

describe('rankMeaning', () => {
  const levels = ['low', 'medium', 'high'];

  it('sorts by score descending, keeps input order for ties, and sends the identical rubric to every item', async () => {
    const scores = new Map([
      ['a', 1.2],
      ['b', 0.8],
      ['c', 1.2],
    ]);
    const calls = stubFetch((call) =>
      scoreOk(call, scores.get(sentBody(call).state as string) ?? 0, levels),
    );

    const ranked = await rankMeaning(['a', 'b', 'c'], levels, { apiKey: API_KEY });

    expect(ranked).toEqual(['a', 'c', 'b']);
    expect(calls).toHaveLength(3);

    // Identical rubric for every item: one score question, same instructions and criteria.
    const questions = calls.map((call) => questionOf(call));
    const [first] = questions;
    for (const question of questions) {
      expect(question).toEqual(first);
    }
    expect(first).toMatchObject({ type: 'score', criteria: levels });
  });

  it('throws before any fetch when levels are empty, single, or more than 10', async () => {
    const invalid: string[][] = [
      [],
      ['only one'],
      Array.from({ length: 11 }, (_, i) => `level ${i + 1}`),
    ];
    for (const badLevels of invalid) {
      const calls = stubFetch((call) => scoreOk(call, 1, badLevels));
      await expect(rankMeaning(['a'], badLevels, { apiKey: API_KEY })).rejects.toThrow(JevError);
      expect(calls).toHaveLength(0);
      vi.unstubAllGlobals();
    }
  });

  it('returns an empty array for empty input without calling the API', async () => {
    const calls = stubFetch((call) => scoreOk(call, 1, levels));
    await expect(rankMeaning([], levels, { apiKey: API_KEY })).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('changedMeaning', () => {
  it('judges the structured state { before, after } and resolves true on high P(yes)', async () => {
    const calls = stubFetch((call) => noulOk(call, 0.95));
    const before = { replicas: 2, region: 'eu-west-1' };
    const after = { replicas: 5, region: 'eu-west-1' };

    const changed = await changedMeaning(before, after, 'deployment requirements changed', {
      apiKey: API_KEY,
    });

    expect(changed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(sentBody(calls[0]).state).toEqual({ before, after });
    expect(questionOf(calls[0])).toEqual({
      type: 'noul',
      instructions: 'deployment requirements changed',
    });
  });

  it('resolves false when P(yes) is below the default threshold', async () => {
    stubFetch((call) => noulOk(call, 0.1));
    await expect(
      changedMeaning('old config', 'new config', 'deployment requirements changed', {
        apiKey: API_KEY,
      }),
    ).resolves.toBe(false);
  });
});

describe('bounded concurrency', () => {
  async function maxInFlight(
    items: readonly number[],
    options?: { concurrency?: number },
  ): Promise<{ max: number; total: number }> {
    let inFlight = 0;
    let max = 0;
    const calls = stubFetch(async (call) => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
      inFlight -= 1;
      return noulOk(call, 0.9);
    });
    await findMeaning(items, 'q', { apiKey: API_KEY, ...options });
    return { max, total: calls.length };
  }

  it('keeps at most 4 per-item fetches in flight by default (10 items)', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i + 1);
    const { max, total } = await maxInFlight(items);
    expect(total).toBe(10);
    expect(max).toBe(4);
  });

  it('honors a smaller concurrency option', async () => {
    const { max, total } = await maxInFlight([1, 2, 3, 4, 5], { concurrency: 2 });
    expect(total).toBe(5);
    expect(max).toBe(2);
  });

  it('throws before any fetch when concurrency is not a positive integer', async () => {
    const calls = stubFetch((call) => noulOk(call, 0.9));
    await expect(findMeaning([1, 2], 'q', { apiKey: API_KEY, concurrency: 0 })).rejects.toThrow(
      JevError,
    );
    expect(calls).toHaveLength(0);
  });
});
````

## Out of scope

- No other file changes (workflows, tsconfig files, .prettierignore, LICENSE,
  eslint/vitest configs, src/meaning.ts, src/types.ts, src/index.ts,
  tests/ifjev.test.ts are all final and must not be touched).
- No new files, no new dependencies, no test-assertion changes (the
  transcription preserves every assertion).

## Verification

The controller verifies the candidate byte-for-byte against the same targets
and re-runs lint, format check, typecheck, tests, and build in a disposable
copy. Your self-check is optional; report checks as unrun if you cannot run
them.

## Division of labor

Worker: titan (CLI pi, model `litellm/titan/llamacpp/qwen3.8-q4s-256k`,
thinking high, profile `profiles/titan-qwen38.json`) per operator directive.
The worker produces a candidate and patch in its sandbox and never applies
or commits. The controller (this agent) reviews, verifies, applies, records
the review, and handles git.
