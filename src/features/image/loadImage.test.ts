import { describe, expect, it } from "vitest";
import { validateDimensions } from "./loadImage";
describe("image dimension validation", () => {
  it("accepts portrait and landscape images", () => {
    expect(() => validateDimensions(1200, 850)).not.toThrow();
    expect(() => validateDimensions(500, 1500)).not.toThrow();
  });
  it("rejects empty, invalid and oversized decoded dimensions", () => {
    for (const [w, h] of [
      [0, 10],
      [1.5, 10],
      [Infinity, 10],
      [5000, 5000],
    ])
      expect(() => validateDimensions(w, h)).toThrow();
  });
});
