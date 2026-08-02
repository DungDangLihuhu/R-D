import type { Transaction } from "./types";

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function hiddenSymbolSet(symbols: string[] | undefined): Set<string> {
  return new Set((symbols ?? []).map(normalizeSymbol));
}

export function isSymbolScopedTransaction(tx: Transaction): boolean {
  return tx.type === "BUY" || tx.type === "SELL" || tx.type === "DIVIDEND";
}

export function isTransactionHidden(
  tx: Transaction,
  hidden: ReadonlySet<string>
): boolean {
  return (
    isSymbolScopedTransaction(tx) && hidden.has(normalizeSymbol(tx.symbol))
  );
}

export function filterHiddenTransactions(
  transactions: Transaction[],
  portfolioId: string,
  hidden: ReadonlySet<string>
): Transaction[] {
  if (hidden.size === 0) return transactions;
  return transactions.filter(
    (tx) =>
      tx.portfolioId !== portfolioId || !isTransactionHidden(tx, hidden)
  );
}
