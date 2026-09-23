/** TypeSafe Jev systemone endpoint. */
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

/** Default model id. */
export const DEFAULT_MODEL = 'jev-latest';

/** Default per-attempt request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Default number of 429/529 retries after the first attempt. */
export const DEFAULT_RETRIES = 3;

/** Default yes threshold: p >= threshold counts as yes. */
export const DEFAULT_THRESHOLD = 0.85;

/** Default cap on in-flight per-item requests. */
export const DEFAULT_CONCURRENCY = 4;

/** Noul (yes/no) question; `instructions` carries the question wording. */
export interface NoulQuestion {
  type: 'noul';
  instructions: string | object | unknown[];
  criteria?: {
    true?: unknown;
    false?: unknown;
  };
}

/** Score question; `criteria` is 2 to 10 ordered level descriptions. */
export interface ScoreQuestion {
  type: 'score';
  instructions: string | object | unknown[];
  criteria: string[];
}

export type JevQuestion = NoulQuestion | ScoreQuestion;

/** Noul answer: `noul` is P(yes) in [0, 1]. There is no confidence field. */
export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

/** Score answer. Level keys are stringified indices ("0", "1", ...). */
export interface ScoreAnswer {
  type: 'score';
  /** Fractional score; may land between levels. */
  score: number;
  legend: Record<string, unknown>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type JevAnswer = NoulAnswer | ScoreAnswer;

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

/** Response body of POST /v1/systemone. */
export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
}

/** Module-level and per-call options shared by every jevais function. */
export interface JevaisOptions {
  /** TypeSafe API key; falls back to configure(), then TYPESAFE_API_KEY. */
  apiKey?: string;
  /** Model id. Default: "jev-latest". */
  model?: string;
  /** Per-attempt request timeout in ms. Default: 30000. */
  timeoutMs?: number;
  /** 429/529 retries after the first attempt. Default: 3. */
  retries?: number;
}

/** Options for threshold-based judgments. */
export interface MeaningOptions extends JevaisOptions {
  /** Yes threshold, expected in (0, 1). Default: 0.85. */
  threshold?: number;
  /** Max in-flight per-item requests. Default: 4. */
  concurrency?: number;
}

/** Options for rankMeaning. */
export interface RankOptions extends JevaisOptions {
  /** Max in-flight per-item requests. Default: 4. */
  concurrency?: number;
}
