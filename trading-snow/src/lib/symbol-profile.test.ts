import { describe, expect, it } from "vitest";
import { tickerWithExchange } from "./symbol-profile";

describe("tickerWithExchange", () => {
  it("names the exchange for non-US listings", () => {
    expect(tickerWithExchange("SAN.PA")).toBe("SAN · Paris");
    expect(tickerWithExchange("vod.l")).toBe("VOD · London");
    expect(tickerWithExchange("AAPL")).toBe("AAPL");
    expect(tickerWithExchange("BRK.B")).toBe("BRK.B");
  });
});
