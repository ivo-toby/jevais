import {
  DEFAULT_MODEL,
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  JEV_ENDPOINT,
  type JevResponse,
  type JevaisOptions,
  type NoulQuestion,
  type ScoreAnswer,
  type ScoreQuestion,
} from './types.js';

/** HTTP statuses that are retried with backoff (rate limit / overloaded). */
const RETRYABLE_STATUSES: readonly number[] = [429, 529];

/** First backoff delay; doubles per retry, capped at MAX_RETRY_DELAY_MS. */
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;
const BODY_SNIPPET_LIMIT = 500;

interface JevErrorOptions {
  status?: number;
  body?: string;
  cause?: unknown;
}

/**
 * Error for every jevais failure: missing API key, HTTP error (401, 422, ...),
 * network error, timeout, or malformed response. Public functions never
 * convert a JevError into a false/empty result.
 */
export class JevError extends Error {
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;
  /** Raw response body snippet, when available. */
  readonly body?: string;

  constructor(message: string, options: JevErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'JevError';
    this.status = options.status;
    this.body = options.body;
  }
}

/** Module-level defaults set through configure(). */
const moduleConfig: JevaisOptions = {};

/**
 * Set module-level defaults; later calls merge over earlier ones and
 * per-call options still take precedence. When no apiKey is set anywhere,
 * the TYPESAFE_API_KEY environment variable is used.
 */
export function configure(options: JevaisOptions = {}): void {
  if (options.apiKey !== undefined) moduleConfig.apiKey = options.apiKey;
  if (options.model !== undefined) moduleConfig.model = options.model;
  if (options.timeoutMs !== undefined) moduleConfig.timeoutMs = options.timeoutMs;
  if (options.retries !== undefined) moduleConfig.retries = options.retries;
}

interface ResolvedConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  retries: number;
}

/** Throws (before any fetch) when no API key is available. */
function resolveConfig(overrides?: JevaisOptions): ResolvedConfig {
  const apiKey = overrides?.apiKey ?? moduleConfig.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    throw new JevError(
      'Missing TypeSafe API key: pass { apiKey }, configure({ apiKey }), or set TYPESAFE_API_KEY.',
    );
  }
  return {
    apiKey,
    model: overrides?.model ?? moduleConfig.model ?? DEFAULT_MODEL,
    timeoutMs: overrides?.timeoutMs ?? moduleConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: overrides?.retries ?? moduleConfig.retries ?? DEFAULT_RETRIES,
  };
}

/**
 * POST one question set over the shared `state` and return the validated
 * response. Retries 429/529 (up to `retries` times, exponential backoff,
 * honoring numeric Retry-After in seconds); every other failure throws a
 * JevError carrying status and/or a raw body snippet.
 */
async function postJev(
  questions: Record<string, NoulQuestion | ScoreQuestion>,
  state: unknown,
  config: ResolvedConfig,
): Promise<JevResponse> {
  const payload = JSON.stringify({ state, model: config.model, questions });
  let retry = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (cause) {
      throw new JevError(`Jev request failed: ${describe(cause)}`, { cause });
    }

    if (RETRYABLE_STATUSES.includes(response.status)) {
      if (retry >= config.retries) {
        const body = await bodySnippet(response);
        throw new JevError(
          `Jev API returned HTTP ${response.status} after ${retry + 1} attempt${retry === 0 ? '' : 's'}`,
          {
            status: response.status,
            body,
          },
        );
      }
      retry += 1;
      await sleep(retryDelayMs(response, retry));
      continue;
    }

    if (!response.ok) {
      const body = await bodySnippet(response);
      throw new JevError(`Jev API request failed with HTTP ${response.status}`, {
        status: response.status,
        body,
      });
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (cause) {
      throw new JevError('Jev API returned a malformed (non-JSON) response body', { cause });
    }
    return validateResponse(data);
  }
}

function retryDelayMs(response: Response, retry: number): number {
  const raw = response.headers.get('retry-after');
  if (raw !== null) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** (retry - 1), MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function bodySnippet(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (text === '') return undefined;
    return text.length > BODY_SNIPPET_LIMIT ? `${text.slice(0, BODY_SNIPPET_LIMIT)}...` : text;
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateResponse(data: unknown): JevResponse {
  if (!isPlainObject(data)) {
    throw new JevError('Jev API returned a malformed response body');
  }
  if (!isPlainObject(data.answers)) {
    throw new JevError('Jev API returned a malformed response body: missing "answers"');
  }
  if (typeof data.model !== 'string') {
    throw new JevError('Jev API returned a malformed response body: "model" is not a string');
  }
  if (!isPlainObject(data.usage)) {
    throw new JevError('Jev API returned a malformed response body: missing "usage"');
  }
  // Runtime validation above; the Record narrowing cannot express JevResponse.
  return data as unknown as JevResponse;
}

function isUnitProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Ask one Noul question over `state` in a single request; resolves P(yes) in
 * [0, 1]. The question id never reaches the model; only `instructions` does.
 * Throws JevError on any failure (never resolves a failure as a probability).
 */
export async function askNoul(
  instructions: string,
  state: unknown,
  options?: JevaisOptions,
): Promise<number> {
  const config = resolveConfig(options);
  const questions: Record<string, NoulQuestion> = { noul: { type: 'noul', instructions } };
  const response = await postJev(questions, state, config);
  const answer = response.answers.noul;
  if (answer === undefined || answer.type !== 'noul' || !isUnitProbability(answer.noul)) {
    throw new JevError('Jev API returned a malformed Noul answer');
  }
  return answer.noul;
}

/**
 * Ask one Score question over `state` in a single request using the given
 * ordered level descriptions (2 to 10 levels). Throws JevError on any
 * failure.
 */
export async function askScore(
  instructions: string,
  criteria: readonly string[],
  state: unknown,
  options?: JevaisOptions,
): Promise<ScoreAnswer> {
  const config = resolveConfig(options);
  const questions: Record<string, ScoreQuestion> = {
    score: { type: 'score', instructions, criteria: [...criteria] },
  };
  const response = await postJev(questions, state, config);
  const answer = response.answers.score;
  if (
    answer === undefined ||
    answer.type !== 'score' ||
    !Number.isFinite(answer.score) ||
    typeof answer.confidence !== 'number' ||
    !isPlainObject(answer.legend) ||
    !isPlainObject(answer.probabilities)
  ) {
    throw new JevError('Jev API returned a malformed Score answer');
  }
  return answer;
}
