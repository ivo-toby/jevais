import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevError, ifjev } from '../src/index.js';

const API_KEY = 'test-api-key';
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ifjev', () => {
  it('resolves true when P(yes) >= threshold, sending one noul question over the state', async () => {
    const calls = stubFetch((call) => noulOk(call, 0.9));
    const result = await ifjev('user reacts angry', { text: 'ugh, whatever' }, 0.85, {
      apiKey: API_KEY,
    });

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);

    const call = calls[0];
    expect(call.url).toBe(ENDPOINT);
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toEqual({
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    });

    const body = sentBody(call);
    expect(body.model).toBe('jev-latest');
    expect(body.state).toEqual({ text: 'ugh, whatever' });
    expect(questionOf(call)).toEqual({ type: 'noul', instructions: 'user reacts angry' });
  });

  it('resolves false when P(yes) < threshold, without swallowing an error', async () => {
    stubFetch((call) => noulOk(call, 0.5));
    await expect(
      ifjev('user reacts angry', 'user response text', 0.85, { apiKey: API_KEY }),
    ).resolves.toBe(false);
  });

  it('counts P(yes) exactly at the threshold as true (>= boundary)', async () => {
    stubFetch((call) => noulOk(call, 0.85));
    await expect(ifjev('user reacts angry', 'state', 0.85, { apiKey: API_KEY })).resolves.toBe(
      true,
    );
  });

  it('counts P(yes) just below the threshold as false', async () => {
    stubFetch((call) => noulOk(call, 0.84));
    await expect(ifjev('user reacts angry', 'state', 0.85, { apiKey: API_KEY })).resolves.toBe(
      false,
    );
  });

  it('uses 0.85 as the default threshold', async () => {
    stubFetch((call) => noulOk(call, 0.85));
    await expect(ifjev('user reacts angry', 'state', undefined, { apiKey: API_KEY })).resolves.toBe(
      true,
    );
  });

  it('rejects with a JevError when the request fails, never resolving false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(ifjev('user reacts angry', 'state', 0.85, { apiKey: API_KEY })).rejects.toThrow(
      JevError,
    );
  });
});
