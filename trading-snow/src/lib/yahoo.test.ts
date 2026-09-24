import { describe, expect, it } from "vitest";
import { yahooInsiderCode } from "./yahoo";

describe("yahooInsiderCode", () => {
  it("only codes real open-market trades as P or S", () => {
    expect(yahooInsiderCode("Purchase at price 95.00 per share.")).toBe("P");
    expect(yahooInsiderCode("Sale at price 37.59 per share.")).toBe("S");
    expect(yahooInsiderCode("Sale at price 330.19 - 331.00 per share.")).toBe("S");
  });

  it("keeps grants, gifts, exercises and blank rows out of buying", () => {
    expect(yahooInsiderCode("Stock Award(Grant) at price 0.00 per share.")).toBe("A");
    expect(yahooInsiderCode("Stock Gift at price 0.00 per share.")).toBe("G");
    expect(
      yahooInsiderCode("Conversion of Exercise of derivative security at price 25.00 per share.")
    ).toBe("M");
    expect(yahooInsiderCode("")).toBe("J");
    expect(yahooInsiderCode(undefined)).toBe("J");
  });
});
