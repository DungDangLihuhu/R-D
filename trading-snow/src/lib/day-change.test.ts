import { describe, expect, it } from "vitest";
import { dayChange } from "./day-change";

describe("dayChange", () => {
  it("adds the regular session to the after-hours move", () => {
    // AAPL: đóng cửa 337,02 (−2,72 / −0,80%), sau giờ 336,94 (−0,08).
    const today = dayChange({
      price: 336.94,
      change: -0.08,
      changePercent: -0.024,
      marketSession: "post",
      regularChange: -2.72,
      regularChangePercent: -0.8,
    });
    expect(today.change).toBeCloseTo(-2.8, 8);
    expect(today.changePercent).toBeCloseTo((-2.8 / 339.74) * 100, 8);
  });

  it("keeps the quote's own move in and before the session", () => {
    expect(dayChange({ price: 340, change: 2.98, changePercent: 0.88, marketSession: "regular" })).toEqual({
      change: 2.98,
      changePercent: 0.88,
    });
    expect(dayChange({ price: 338, change: 0.98, changePercent: 0.29, marketSession: "pre" })).toEqual({
      change: 0.98,
      changePercent: 0.29,
    });
  });

  it("falls back to the stored move when an old quote has no regular session", () => {
    expect(dayChange({ price: 336.94, change: -0.08, changePercent: -0.024, marketSession: "post" }).change).toBe(-0.08);
  });
});
