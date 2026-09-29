import { describe, expect, it } from "vitest";
import { batches, checksFor } from "../src/audit/questions";
import { codeFindings, jevFindings, rank } from "../src/audit/rank";
import type { Element, Snapshot } from "../src/audit/types";

const el = (id: string, kind: Element["kind"], text: string, over: Partial<Element> = {}): Element => ({
  id, kind, text, context: "Campaigns", region: "main", truncated: false, count: 1, ...over,
});

const snap = (elements: Element[]): Snapshot => ({
  url: "https://ads.example.com/campaigns?x=1", title: "Campaigns", outline: ["Campaigns"], elements,
});

describe("batches", () => {
  it("asks each element's checks, keyed by element id, referencing its index in the batch", () => {
    const [b] = batches(snap([el("e0", "button", "Submit"), el("e1", "message", "Error")]));
    expect(Object.keys(b.questions)).toEqual([
      "e0.clear_action", "e0.jargon", "e1.jargon", "e1.is_problem", "e1.actionable",
    ]);
    expect(JSON.stringify(b.questions["e1.jargon"])).toContain("`elements[1].text`");
    expect(b.state.page.location).toBe("ads.example.com/campaigns");
  });

  it("skips elements with no text and splits into requests", () => {
    const many = Array.from({ length: 65 }, (_, i) => el(`e${i}`, "link", `Link ${i}`));
    const out = batches(snap([el("x", "button", ""), ...many]), 30);
    expect(out.map((b) => b.elements.length)).toEqual([30, 30, 5]);
    // Each batch indexes from zero: the model only sees its own batch.
    expect(JSON.stringify(out[1].questions["e30.clear_action"])).toContain("`elements[0].text`");
  });

  it("gives labels and prose the right checks", () => {
    expect(checksFor("column")).toEqual(["clear_label", "jargon"]);
    expect(checksFor("text")).toEqual(["jargon", "is_problem", "actionable"]);
  });
});

describe("rank", () => {
  it("inverts positive questions and combines problem × not-actionable", () => {
    const els = [el("e0", "button", "Submit"), el("e1", "message", "Something went wrong")];
    const findings = jevFindings(els, {
      "e0.clear_action": 0.1, "e0.jargon": 0.05,
      "e1.jargon": 0.02, "e1.is_problem": 0.9, "e1.actionable": 0.2,
    });
    const ranked = rank(findings, 0.6);
    expect(ranked.map((f) => [f.element.id, f.issue])).toEqual([["e0", "vague_action"], ["e1", "unhelpful_error"]]);
    expect(ranked[1].probability).toBeCloseTo(0.72);
  });

  it("weights by region", () => {
    const nav = el("e0", "link", "More", { region: "navigation" });
    const dlg = el("e1", "button", "OK", { region: "dialog" });
    const ranked = rank(jevFindings([nav, dlg], { "e0.clear_action": 0.2, "e1.clear_action": 0.2 }), 0.5);
    expect(ranked.map((f) => f.element.id)).toEqual(["e1", "e0"]);
    expect(ranked[1].score).toBeCloseTo(0.56);
  });

  it("finds deterministic problems in code", () => {
    const issues = codeFindings([
      el("e0", "button", ""),
      el("e1", "button", "Duplicate campaign", { truncated: true }),
      el("e2", "text", "{{campaign_value}}"),
      el("e3", "text", "Null values are excluded"),
    ]).map((f) => `${f.element.id}:${f.issue}`);
    expect(issues).toEqual(["e0:no_label", "e1:truncated", "e2:raw_value"]);
  });
});
