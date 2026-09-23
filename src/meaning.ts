import { JevError, askNoul, askScore } from './client.js';
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_THRESHOLD,
  type JevaisOptions,
  type MeaningOptions,
  type RankOptions,
} from './types.js';

/**
 * Neutral instructions for ranking: the ordered `levels` carry the rubric, so
 * the wording stays identical (and literal) for every item.
 */
const RANK_INSTRUCTIONS = 'Rate this item on the provided scale.';

/** Partition result of partitionMeaning. */
export interface PartitionResult<T> {
  yes: T[];
  no: T[];
  uncertain: T[];
}

/**
 * Ask whether `question` holds of `state`; resolves true when P(yes) >=
 * threshold. One Noul question in one request.
 */
export async function ifjev(
  question: string,
  state: unknown,
  threshold: number = DEFAULT_THRESHOLD,
  options?: JevaisOptions,
): Promise<boolean> {
  const p = await askNoul(question, state, options);
  return p >= threshold;
}

/**
 * Return the first item (original order) whose P(yes) >= threshold, or
 * undefined when none match. One Noul request per item with bounded
 * concurrency, so completion order never affects the result. Empty input
 * resolves undefined without calling the API.
 */
export async function findMeaning<T>(
  items: readonly T[],
  question: string,
  options?: MeaningOptions,
): Promise<T | undefined> {
  if (items.length === 0) return undefined;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const probabilities = await judgeAll(items, question, options);
  const index = probabilities.findIndex((p) => p >= threshold);
  return index === -1 ? undefined : items[index];
}

/**
 * Split items by P(yes): p >= threshold -> yes, p <= 1 - threshold -> no,
 * everything else -> uncertain. Uncertain is explicit and never silently
 * treated as no. One Noul request per item with bounded concurrency. Empty
 * input returns three empty arrays without calling the API.
 */
export async function partitionMeaning<T>(
  items: readonly T[],
  question: string,
  options?: MeaningOptions,
): Promise<PartitionResult<T>> {
  const result: PartitionResult<T> = { yes: [], no: [], uncertain: [] };
  if (items.length === 0) return result;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const noCutoff = 1 - threshold;
  const probabilities = await judgeAll(items, question, options);
  for (let i = 0; i < items.length; i += 1) {
    const p = probabilities[i];
    if (p >= threshold) result.yes.push(items[i]);
    else if (p <= noCutoff) result.no.push(items[i]);
    else result.uncertain.push(items[i]);
  }
  return result;
}

/**
 * Order items by a Score judgment using the identical 2-to-10-level rubric
 * for every item; sorted by score descending, stable for ties. Returns the
 * items only (no scores). One Score request per item with bounded
 * concurrency. Invalid levels (empty, one, or > 10) throw before any fetch;
 * empty input returns [] without calling the API.
 */
export async function rankMeaning<T>(
  items: readonly T[],
  levels: readonly string[],
  options?: RankOptions,
): Promise<T[]> {
  assertLevels(levels);
  if (items.length === 0) return [];
  const scores = await mapWithConcurrency(items, concurrencyOf(options), async (item) => {
    const answer = await askScore(RANK_INSTRUCTIONS, levels, item, options);
    return answer.score;
  });
  const order = scores
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.index);
  return order.map((index) => items[index]);
}

/**
 * Ask whether `after` changed in the sense of `question`, judged over the
 * structured state { before, after }; resolves true when P(yes) >= threshold.
 */
export async function changedMeaning(
  before: unknown,
  after: unknown,
  question: string,
  options?: MeaningOptions,
): Promise<boolean> {
  const p = await askNoul(question, { before, after }, options);
  return p >= (options?.threshold ?? DEFAULT_THRESHOLD);
}

/** One Noul request per item, bounded concurrency, results in input order. */
async function judgeAll<T>(
  items: readonly T[],
  question: string,
  options: MeaningOptions | undefined,
): Promise<number[]> {
  return mapWithConcurrency(items, concurrencyOf(options), (item) =>
    askNoul(question, item, options),
  );
}

function assertLevels(levels: readonly string[]): void {
  if (!Array.isArray(levels) || levels.length < 2 || levels.length > 10) {
    throw new JevError('levels must be an array of 2 to 10 ordered level descriptions');
  }
}

function concurrencyOf(options: { concurrency?: number } | undefined): number {
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new JevError('concurrency must be a positive integer');
  }
  return concurrency;
}

/**
 * Run `fn` over `items` with at most `limit` calls in flight; results keep
 * input order. Any rejection rejects the whole operation (failures are never
 * turned into missing/empty results).
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}
