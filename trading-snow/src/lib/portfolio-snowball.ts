import type { Transaction } from "./types";

export interface CashFlow {
  date: Date;
  amount: number;
}

/** Portfolio gain net of external deposits/withdrawals (Snowball total profit). */
export function computeTotalProfit(
  portfolioValue: number,
  totalDeposits: number,
  totalWithdrawals: number
): number {
  return portfolioValue + totalWithdrawals - totalDeposits;
}

export function buildIrrCashFlows(
  transactions: Transaction[],
  portfolioValue: number,
  asOf = new Date()
): CashFlow[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const hasExternal = sorted.some(
    (t) => t.type === "DEPOSIT" || t.type === "WITHDRAW"
  );

  const flows: CashFlow[] = [];

  for (const tx of sorted) {
    const gross = tx.quantity * tx.price;
    const date = new Date(tx.date);

    if (hasExternal) {
      if (tx.type === "DEPOSIT") flows.push({ date, amount: -gross });
      if (tx.type === "WITHDRAW") flows.push({ date, amount: gross });
    } else {
      if (tx.type === "BUY") flows.push({ date, amount: -(gross + tx.fee) });
      if (tx.type === "SELL") flows.push({ date, amount: gross - tx.fee });
    }

    if (tx.type === "DIVIDEND") {
      flows.push({ date, amount: gross - tx.fee });
    }
  }

  flows.push({ date: asOf, amount: portfolioValue });
  return flows;
}

/** XIRR via Newton-Raphson; returns annual rate in percent or null. */
export function computeXirr(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;

  const t0 = flows[0].date.getTime();
  const years = (d: Date) => (d.getTime() - t0) / (365.25 * 24 * 3600 * 1000);

  const npv = (rate: number) =>
    flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** years(f.date), 0);

  const dnpv = (rate: number) =>
    flows.reduce((sum, f) => {
      const t = years(f.date);
      if (t === 0) return sum;
      return sum - (t * f.amount) / (1 + rate) ** (t + 1);
    }, 0);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate);
    if (Math.abs(value) < 1e-7) return rate * 100;
    const deriv = dnpv(rate);
    if (deriv === 0 || !Number.isFinite(deriv)) break;
    const next = rate - value / deriv;
    if (!Number.isFinite(next) || next <= -0.999) break;
    rate = next;
  }

  return null;
}

export interface DividendEventLike {
  symbol: string;
  date: string;
  amount: number;
}

/** Trailing 12-month dividend per share from history. */
export function trailingAnnualDividendPerShare(
  events: DividendEventLike[]
): number {
  const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
  return events
    .filter((e) => new Date(e.date).getTime() >= cutoff)
    .reduce((sum, e) => sum + e.amount, 0);
}

export function projectPassiveIncome(
  holdings: { symbol: string; quantity: number }[],
  dividendEvents: DividendEventLike[],
  holdingsValue: number
): { annualIncome: number; yieldPercent: number } {
  if (holdingsValue <= 0 || holdings.length === 0) {
    return { annualIncome: 0, yieldPercent: 0 };
  }

  const bySymbol = new Map<string, DividendEventLike[]>();
  for (const e of dividendEvents) {
    const list = bySymbol.get(e.symbol) ?? [];
    list.push(e);
    bySymbol.set(e.symbol, list);
  }

  let annualIncome = 0;
  for (const h of holdings) {
    const events = bySymbol.get(h.symbol.toUpperCase()) ?? [];
    annualIncome += trailingAnnualDividendPerShare(events) * h.quantity;
  }

  return {
    annualIncome,
    yieldPercent: (annualIncome / holdingsValue) * 100,
  };
}
