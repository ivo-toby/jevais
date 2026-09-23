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
