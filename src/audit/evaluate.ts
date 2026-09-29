import type { TypeSafeClient } from "@typesafe-ai/sdk";
import type { Batch } from "./questions";
import type { Nouls } from "./rank";

export interface Usage {
  model: string;
  requests: number;
  inputTokens: number;
}

// jev-1.13: $0.042 per million input tokens, output free (docs.typesafe.ai/models).
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/** All batches go out in parallel (bounded); each batch is one request with many questions. */
export async function evaluate(
  client: TypeSafeClient,
  model: string,
  batches: Batch[],
  concurrency = 4,
): Promise<{ nouls: Nouls; usage: Usage }> {
  const nouls: Nouls = {};
  const usage: Usage = { model, requests: 0, inputTokens: 0 };
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const res = await client.systemOne({ model, state: batch.state, questions: batch.questions });
      for (const [key, answer] of Object.entries(res.answers)) nouls[key] = answer.noul;
      usage.model = res.model;
      usage.requests++;
      usage.inputTokens += res.usage.input_tokens;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return { nouls, usage };
}
