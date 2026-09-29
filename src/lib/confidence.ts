// Jev answers say *what*; confidence says whether to act on it.
// See https://docs.typesafe.ai/patterns/confidence-routing
export type Gate = "act" | "review";

export function gate(confidence: number, threshold: number): Gate {
  return confidence >= threshold ? "act" : "review";
}
