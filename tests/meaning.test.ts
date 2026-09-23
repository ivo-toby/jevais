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
