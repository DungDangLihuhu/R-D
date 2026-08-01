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

/**
 * Snowball IRR cash flows: purchases, sales, dividends (net fees), terminal NAV.
 * Deposits/withdrawals only when there are no buy/sell trades.
 */
export function buildIrrCashFlows(
  transactions: Transaction[],
  terminalValue: number,
  asOf = new Date()
): CashFlow[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const hasTrades = sorted.some(
    (t) => t.type === "BUY" || t.type === "SELL"
  );

  const flows: CashFlow[] = [];

  for (const tx of sorted) {
    const gross = tx.quantity * tx.price;
    const date = new Date(tx.date);

    if (hasTrades) {
      switch (tx.type) {
        case "BUY":
          flows.push({ date, amount: -(gross + tx.fee) });
          break;
        case "SELL":
          flows.push({ date, amount: gross - tx.fee });
          break;
        case "DIVIDEND":
          flows.push({ date, amount: gross - tx.fee });
          break;
      }
    } else {
      switch (tx.type) {
        case "DEPOSIT":
          flows.push({ date, amount: -gross });
          break;
        case "WITHDRAW":
          flows.push({ date, amount: gross });
          break;
        case "DIVIDEND":
          flows.push({ date, amount: gross - tx.fee });
          break;
      }
    }
  }

  if (terminalValue > 0) {
    flows.push({ date: asOf, amount: terminalValue });
  }

  return flows;
}

function npvAt(flows: CashFlow[], rate: number): number {
  const t0 = flows[0].date.getTime();
  const years = (d: Date) => (d.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
  return flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** years(f.date), 0);
}

function newtonXirr(flows: CashFlow[], guess: number): number | null {
  const t0 = flows[0].date.getTime();
  const years = (d: Date) => (d.getTime() - t0) / (365.25 * 24 * 3600 * 1000);

  const dnpv = (rate: number) =>
    flows.reduce((sum, f) => {
      const t = years(f.date);
      if (t === 0) return sum;
      return sum - (t * f.amount) / (1 + rate) ** (t + 1);
    }, 0);

  let rate = guess;
  for (let i = 0; i < 50; i++) {
    const value = npvAt(flows, rate);
    if (Math.abs(value) < 1e-7) return rate * 100;
    const deriv = dnpv(rate);
    if (deriv === 0 || !Number.isFinite(deriv)) return null;
    const next = rate - value / deriv;
    if (!Number.isFinite(next) || next <= -0.999 || next > 100) return null;
    if (Math.abs(next - rate) < 1e-10) return next * 100;
    rate = next;
  }
  return null;
}

function bisectionXirr(flows: CashFlow[]): number | null {
  let lo = -0.99;
  let hi = 10;
  let fLo = npvAt(flows, lo);
  let fHi = npvAt(flows, hi);

  if (fLo * fHi > 0) {
    hi = 100;
    fHi = npvAt(flows, hi);
    if (fLo * fHi > 0) return null;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(flows, mid);
    if (Math.abs(fMid) < 1e-7) return mid * 100;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return ((lo + hi) / 2) * 100;
}

function computeXirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;

  const outflows = flows.filter((f) => f.amount < 0);
  const inflows = flows.filter((f) => f.amount > 0);
  if (outflows.length === 0 || inflows.length === 0) return null;

  const guesses = [0.1, 0.01, 0.15, -0.05, 0.25, -0.15, 0.5];
  for (const g of guesses) {
    const result = newtonXirr(flows, g);
    if (result != null && Number.isFinite(result)) return result;
  }

  return bisectionXirr(flows);
}

/** Simple annualized return when XIRR does not converge. */
export function computeSimpleAnnualizedReturn(
  flows: CashFlow[]
): number | null {
  if (flows.length < 2) return null;

  const invested = flows
    .filter((f) => f.amount < 0)
    .reduce((s, f) => s + Math.abs(f.amount), 0);
  const terminal = flows[flows.length - 1];
  if (invested <= 0 || terminal.amount <= 0) return null;

  const years =
    (terminal.date.getTime() - flows[0].date.getTime()) /
    (365.25 * 24 * 3600 * 1000);
  if (years < 1 / 365) return null;

  return (Math.pow(terminal.amount / invested, 1 / years) - 1) * 100;
}

/** XIRR with fallback — annual rate in percent (Snowball-style). */
export function computePortfolioIrr(flows: CashFlow[]): number | null {
  return computeXirr(flows) ?? computeSimpleAnnualizedReturn(flows);
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
