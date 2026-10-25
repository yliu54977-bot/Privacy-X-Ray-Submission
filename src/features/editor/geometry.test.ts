import { describe, it, expect } from "vitest";
import {
  createRect,
  imagePoint,
  moveRect,
  resizeRect,
  validRect,
} from "./geometry";
describe("original-pixel editor geometry", () => {
  it("normalizes a reverse drag", () =>
    expect(createRect({ x: 80, y: 60 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 60,
      height: 50,
    }));
  it("maps preview coordinates accurately at different scales", () => {
    for (const scale of [0.25, 0.5, 1, 2])
      expect(
        imagePoint(
          10 + 300 * scale,
          20 + 200 * scale,
          { left: 10, top: 20, width: 1000 * scale, height: 800 * scale },
          1000,
          800,
        ),
      ).toEqual({ x: 300, y: 200 });
  });
  it("clamps drawing points to image bounds", () =>
    expect(
      imagePoint(
        -5,
        900,
        { left: 0, top: 0, width: 500, height: 400 },
        1000,
        800,
      ),
    ).toEqual({ x: 0, y: 800 }));
  it("moves without changing size and stays inside boundaries", () =>
    expect(
      moveRect(
        { x: 20, y: 30, width: 100, height: 50 },
        { x: 1000, y: -100 },
        400,
        300,
      ),
    ).toEqual({ x: 300, y: 0, width: 100, height: 50 }));
  it("resizes all four corners around their opposite corner", () => {
    const r = { x: 100, y: 100, width: 100, height: 100 };
    expect(resizeRect(r, "nw", { x: 50, y: 60 }, 500, 500)).toEqual({
      x: 50,
      y: 60,
      width: 150,
      height: 140,
    });
    expect(resizeRect(r, "ne", { x: 250, y: 60 }, 500, 500)).toEqual({
      x: 100,
      y: 60,
      width: 150,
      height: 140,
    });
    expect(resizeRect(r, "sw", { x: 50, y: 250 }, 500, 500)).toEqual({
      x: 50,
      y: 100,
      width: 150,
      height: 150,
    });
    expect(resizeRect(r, "se", { x: 250, y: 250 }, 500, 500)).toEqual({
      x: 100,
      y: 100,
      width: 150,
      height: 150,
    });
  });
  it("handles crossing the opposite corner", () =>
    expect(
      resizeRect(
        { x: 10, y: 10, width: 20, height: 20 },
        "nw",
        { x: 50, y: 50 },
        100,
        100,
      ),
    ).toEqual({ x: 30, y: 30, width: 20, height: 20 }));
  it("rejects zero area and nonfinite geometry", () => {
    expect(validRect({ x: 0, y: 0, width: 0, height: 1 })).toBe(false);
    expect(validRect({ x: NaN, y: 0, width: 1, height: 1 })).toBe(false);
  });
});
