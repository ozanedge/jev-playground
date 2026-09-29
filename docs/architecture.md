# Architecture

PLACEHOLDER — fill in once the app is chosen.

## The rule this scaffold follows

Code stays in control; Jev makes narrow, typed decisions. Each decision is:

1. **State** — the text or JSON Jev reads (≤32k tokens with the longest question).
2. **Questions** — fixed `choice` / `score` / `noul` definitions, declared in code.
3. **Action** — plain code that turns typed answers into behaviour, gated on
   `confidence` (act vs. send to review).

Jev does not generate text. If a step needs prose, that's an LLM's job; Jev can
decide *whether* and *where* to route it.

## Layout

| Path | What lives there |
| --- | --- |
| `src/decisions/` | One file per decision: questions + the code that acts on answers |
| `src/lib/jev.ts` | Server-only client and model pin |
| `src/lib/confidence.ts` | Confidence gating |
| `src/app/api/` | HTTP endpoints that run decisions |
| `src/app/` | UI |

## Open questions

- What does the app do? Who uses it?
- Which decisions does it make, and what's the review path below the threshold?
- When to pin `JEV_MODEL` to a versioned id instead of `jev-latest`.
