import { describe, expect, it } from "vitest";
import { gate } from "../src/lib/confidence";

describe("gate", () => {
  it("acts at or above the threshold", () => {
    expect(gate(0.7, 0.7)).toBe("act");
    expect(gate(0.95, 0.7)).toBe("act");
  });

  it("sends low-confidence answers to review", () => {
    expect(gate(0.69, 0.7)).toBe("review");
  });
});
