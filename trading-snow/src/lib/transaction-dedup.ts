import type { Transaction } from "./types";

type TxLike = Omit<Transaction, "id"> | Transaction;

function roundField(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

function extractRef(notes?: string): string {
  if (!notes) return "";
  const match = notes.match(/Ref\.?\s*([A-Z0-9]+)/i);
  return match?.[1]?.toUpperCase() ?? "";
}

/** Stable key for matching the same imported trade twice. */
export function transactionDedupKey(tx: TxLike): string {
  const day = tx.date.slice(0, 10);
  return [
    tx.portfolioId,
    day,
    tx.symbol.toUpperCase(),
    tx.type,
    roundField(tx.quantity, 6),
    roundField(tx.price, 4),
    roundField(tx.fee, 4),
    extractRef(tx.notes),
  ].join("|");
}

export function filterDuplicateTransactions(
  existing: Transaction[],
  incoming: Omit<Transaction, "id">[]
): { transactions: Omit<Transaction, "id">[]; skipped: number } {
  const seen = new Set(existing.map(transactionDedupKey));
  const transactions: Omit<Transaction, "id">[] = [];
  let skipped = 0;

  for (const tx of incoming) {
    const key = transactionDedupKey(tx);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    transactions.push(tx);
  }

  return { transactions, skipped };
}
