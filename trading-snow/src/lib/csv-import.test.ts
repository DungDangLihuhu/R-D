import { describe, expect, it } from "vitest";
import { parseBrokerCsv } from "./csv-import";

const HEADER = "date,symbol,type,quantity,price,fee";
const day = (iso: string | undefined) => iso?.slice(0, 10);

describe("parseBrokerCsv dates", () => {
  it("keeps US m/d/y when nothing in the file says otherwise", () => {
    const r = parseBrokerCsv(`${HEADER}\n01/05/2024,AAPL,buy,1,1,0`);
    expect(day(r.rows[0]?.date)).toBe("2024-01-05");
  });

  it("switches the whole file to d/m/y once a day above 12 appears", () => {
    const r = parseBrokerCsv(`${HEADER}\n05/01/2024,AAPL,buy,1,1,0\n25/01/2024,AAPL,buy,1,1,0`);
    expect(r.rows.map((x) => day(x.date))).toEqual(["2024-01-05", "2024-01-25"]);
    expect(r.errors).toEqual([]);
  });

  it("reports an impossible date as a row error instead of throwing", () => {
    const r = parseBrokerCsv(`${HEADER}\n13/13/2024,AAPL,buy,1,1,0`);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]).toMatch(/ngày không hợp lệ/);
  });

  it("keeps the calendar day for written-out dates without a time", () => {
    const r = parseBrokerCsv(`${HEADER}\n"Jan 5, 2024",AAPL,buy,1,1,0`);
    expect(day(r.rows[0]?.date)).toBe("2024-01-05");
  });
});

describe("parseBrokerCsv numbers and delimiters", () => {
  it("reads semicolon files with decimal commas", () => {
    const r = parseBrokerCsv("date;symbol;type;quantity;price;fee\n2024-01-05;AAPL;buy;10;189,50;1,00");
    expect(r.rows[0]).toMatchObject({ quantity: 10, price: 189.5, fee: 1 });
  });

  it("still reads comma thousands separators in quoted values", () => {
    const r = parseBrokerCsv(`${HEADER}\n2024-01-05,AAPL,buy,"1,200",189.5,1`);
    expect(r.rows[0]).toMatchObject({ quantity: 1200, price: 189.5 });
  });

  it("reads European thousands with decimal comma", () => {
    const r = parseBrokerCsv("date;symbol;type;quantity;price;fee\n2024-01-05;AAPL;buy;1;1.234,56;0");
    expect(r.rows[0]?.price).toBeCloseTo(1234.56);
  });
});

describe("Snowball transactions", () => {
  it("imports a split with the Price column as the ratio (Snowball template)", () => {
    const r = parseBrokerCsv(
      "Event,Date,Symbol,Price,Quantity\nBuy,2024-01-05,NVDA,500,10\nSplit,2024-06-10,NVDA,10,100"
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[1]).toMatchObject({ type: "SPLIT", symbol: "NVDA", quantity: 10, price: 0, fee: 0 });
  });

  it("reports a split row without a usable ratio instead of importing it", () => {
    const r = parseBrokerCsv("Event,Date,Symbol,Price,Quantity\nSplit,2024-06-10,NVDA,0,100");
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0]).toMatch(/split NVDA/);
  });
});
