export type Kind =
  | "button"
  | "link"
  | "tab"
  | "menuitem"
  | "heading"
  | "column"
  | "field"
  | "message"
  | "text"
  /** Table data: checked in code only (leaked raw values), never sent to Jev. */
  | "cell";

export type Region = "dialog" | "main" | "form" | "table" | "header" | "navigation" | "sidebar";

/** One on-screen piece of copy, as captured by extract.browser.js. */
export interface Element {
  id: string;
  kind: Kind;
  text: string;
  /** Nearest dialog title or preceding section heading. */
  context: string;
  region: Region;
  placeholder?: string;
  truncated: boolean;
  /** Identical copy (same kind, text and context) collapses into one element. */
  count: number;
}

export interface Snapshot {
  url: string;
  title: string;
  outline: string[];
  elements: Element[];
}

export type Issue =
  | "vague_action"
  | "jargon"
  | "unclear_label"
  | "unhelpful_error"
  | "truncated"
  | "no_label"
  | "raw_value";

export interface Finding {
  element: Element;
  issue: Issue;
  /** Probability the issue is real: Jev's calibrated answer, or 1 for code checks. */
  probability: number;
  /** probability × region weight — what the list is sorted by. */
  score: number;
  source: "jev" | "code";
}
