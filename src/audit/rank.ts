// Turns raw yes-probabilities into findings. Policy lives here, in code, so
// thresholds and weights can change without re-asking Jev.
import type { Element, Finding, Issue, Region } from "./types";

export const ISSUE_LABEL: Record<Issue, string> = {
  vague_action: "vague action",
  unclear_label: "unclear label",
  jargon: "jargon",
  unhelpful_error: "unhelpful problem msg",
  truncated: "truncated",
  no_label: "no label",
  raw_value: "raw value leaked",
};

// Where copy sits changes how much it matters: a dialog button is a decision point,
// a sidebar link is one of many.
const REGION_WEIGHT: Record<Region, number> = {
  dialog: 1,
  form: 1,
  main: 1,
  table: 0.9,
  header: 0.8,
  navigation: 0.7,
  sidebar: 0.7,
};

const RAW_VALUE = /\bundefined\b|\bNaN\b|\[object Object\]|\{\{[^}]*\}\}|\$\{[^}]*\}|lorem ipsum|\bTODO\b|\bFIXME\b|^null$/i;

/** Yes-probabilities keyed `<element id>.<check>`, as returned by Jev. */
export type Nouls = Record<string, number>;

function finding(element: Element, issue: Issue, probability: number, source: Finding["source"]): Finding {
  return { element, issue, probability, score: probability * REGION_WEIGHT[element.region], source };
}

export function codeFindings(elements: Element[]): Finding[] {
  const out: Finding[] = [];
  for (const el of elements) {
    if (!el.text && !["text", "message", "cell"].includes(el.kind)) out.push(finding(el, "no_label", 1, "code"));
    if (el.truncated && el.text) out.push(finding(el, "truncated", 1, "code"));
    if (RAW_VALUE.test(el.text)) out.push(finding(el, "raw_value", 1, "code"));
  }
  return out;
}

export function jevFindings(elements: Element[], nouls: Nouls): Finding[] {
  const out: Finding[] = [];
  const p = (el: Element, check: string) => nouls[`${el.id}.${check}`];
  for (const el of elements) {
    const clearAction = p(el, "clear_action");
    if (clearAction !== undefined) out.push(finding(el, "vague_action", 1 - clearAction, "jev"));
    const clearLabel = p(el, "clear_label");
    if (clearLabel !== undefined) out.push(finding(el, "unclear_label", 1 - clearLabel, "jev"));
    const jargon = p(el, "jargon");
    if (jargon !== undefined) out.push(finding(el, "jargon", jargon, "jev"));
    // Two independent judgments combined here: it's a problem AND it gives no way forward.
    const problem = p(el, "is_problem");
    const actionable = p(el, "actionable");
    if (problem !== undefined && actionable !== undefined) {
      out.push(finding(el, "unhelpful_error", problem * (1 - actionable), "jev"));
    }
  }
  return out;
}

export function rank(findings: Finding[], threshold: number): Finding[] {
  return findings
    .filter((f) => f.probability >= threshold)
    .sort((a, b) => b.score - a.score || b.element.count - a.element.count);
}
