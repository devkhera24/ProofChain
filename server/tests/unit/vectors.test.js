import { describe, it, expect } from "vitest";
import { dot, norm, cosine, normalize, weightedMean } from "../../src/utils/vectors.js";

describe("vector utils", () => {
  it("dot and norm", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(norm([3, 4])).toBe(5);
  });

  it("cosine handles same, opposite, orthogonal and zero vectors", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it("normalize returns a unit vector and leaves zero vectors alone", () => {
    expect(norm(normalize([3, 4]))).toBeCloseTo(1);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it("weightedMean weights vectors, skips empty ones and normalizes", () => {
    const m = weightedMean([
      [[1, 0], 3],
      [[0, 1], 1],
      [[], 5],
      [null, 2],
      [[0, 1], 0],
    ]);
    expect(norm(m)).toBeCloseTo(1);
    expect(m[0] / m[1]).toBeCloseTo(3);
    expect(weightedMean([])).toBeNull();
    expect(weightedMean([[[1, 1], 0]])).toBeNull();
  });
});
