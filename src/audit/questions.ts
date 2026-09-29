// Copy-clarity judgments. Each question is one narrow yes/no about one element,
// phrased positively where possible (Jev reads literally; negations are easy to
// misread) and inverted in rank.ts. Examples live in criteria, not instructions.
import { noul, type NoulQuestion } from "@typesafe-ai/sdk";
import type { Element, Kind, Snapshot } from "./types";

export type Check = "clear_action" | "jargon" | "clear_label" | "is_problem" | "actionable";

const ACTIONS: Kind[] = ["button", "link", "tab", "menuitem"];
const LABELS: Kind[] = ["heading", "column", "field"];
const PROSE: Kind[] = ["message", "text"];

const LABEL_NOUN: Partial<Record<Kind, [string, string]>> = {
  heading: ["section heading", "the section contains"],
  column: ["table column header", "values the column shows"],
  field: ["form field label", "the field asks the user to enter"],
};

export function checksFor(kind: Kind): Check[] {
  if (ACTIONS.includes(kind)) return ["clear_action", "jargon"];
  if (LABELS.includes(kind)) return ["clear_label", "jargon"];
  if (PROSE.includes(kind)) return ["jargon", "is_problem", "actionable"];
  return [];
}

export function question(check: Check, el: Element, i: number): NoulQuestion {
  const ref = `\`elements[${i}].text\``;
  switch (check) {
    case "clear_action":
      return noul(
        `Would a typical user of this product, reading the ${el.kind} label ${ref} in the context \`elements[${i}].context\`, know what will happen when they click it?`,
        {
          true: "The label names the action or destination specifically enough to predict the result, e.g. 'Pause campaign', 'Export CSV', 'Billing settings', or 'Delete' inside a dialog titled 'Delete workspace?'.",
          false: "The label is generic or ambiguous about what it does or what it acts on, and the context does not resolve it, e.g. 'Submit', 'OK', 'Click here', 'More', 'Go', 'Apply' when it is unclear what gets applied.",
        },
      );
    case "clear_label": {
      const [noun, what] = LABEL_NOUN[el.kind]!;
      const hint = el.kind === "field" ? ` (its placeholder, if any, is \`elements[${i}].placeholder\`)` : "";
      return noul(`Does the ${noun} ${ref}${hint} make clear what ${what}?`, {
        true: "Specific and self-explanatory, e.g. 'Daily budget (USD)', 'Last sign-in', 'Billing contact email'.",
        false: "Generic, ambiguous, or empty, e.g. 'Value', 'Data', 'Info', 'Field 1', 'Other', 'Details', 'Settings' with no hint of which settings.",
      });
    }
    case "jargon":
      return noul(
        `Does ${ref} use internal or engineering jargon, raw system identifiers, or unexplained abbreviations that a typical user of this product would not understand?`,
        {
          true: "e.g. 'ERR_QUOTA_EXCEEDED', 'tenant_uuid', 'RBAC binding failed', 'reconcile loop stalled', variable names in snake_case or camelCase, internal codenames.",
          false: "Plain language, product names, or standard terms of this product's own domain that its users are expected to know, e.g. CTR and CPC in an ads tool, p99 latency in a monitoring tool.",
        },
      );
    case "is_problem":
      return noul(
        `Does ${ref} report an error, warning, failure, or something the user cannot do right now?`,
      );
    case "actionable":
      return noul(
        `Suppose ${ref} reports a problem. Does it tell the user why it happened or what they can do next?`,
        {
          true: "Names a cause or a next step, e.g. 'Payment failed: card expired. Update your card in Billing.', 'No campaigns yet. Create one to start.'",
          false: "Only states that something went wrong or is empty, e.g. 'Something went wrong', 'Error', 'Request failed', 'Invalid input', 'No data'.",
        },
      );
  }
}

/** Page-level context every chunk carries, so labels are judged against the product. */
function pageContext(snap: Snapshot) {
  let host = snap.url;
  try {
    const u = new URL(snap.url);
    host = u.host + u.pathname;
  } catch {}
  return { title: snap.title, location: host, section_headings: snap.outline };
}

export interface Batch {
  elements: Element[];
  state: { page: ReturnType<typeof pageContext>; elements: Omit<Element, "id" | "count" | "truncated">[] };
  questions: Record<string, NoulQuestion>;
}

/** Question keys are `<element id>.<check>` — ids are for code only; the model never sees them. */
export function batches(snap: Snapshot, size = 30): Batch[] {
  const page = pageContext(snap);
  const askable = snap.elements.filter((el) => el.text && checksFor(el.kind).length);
  const out: Batch[] = [];
  for (let start = 0; start < askable.length; start += size) {
    const elements = askable.slice(start, start + size);
    const questions: Record<string, NoulQuestion> = {};
    elements.forEach((el, i) => {
      for (const check of checksFor(el.kind)) questions[`${el.id}.${check}`] = question(check, el, i);
    });
    out.push({
      elements,
      state: {
        page,
        elements: elements.map(({ kind, text, context, region, placeholder }) =>
          placeholder ? { kind, text, context, region, placeholder } : { kind, text, context, region },
        ),
      },
      questions,
    });
  }
  return out;
}
