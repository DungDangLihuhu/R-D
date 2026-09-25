import { compareTransactionsChronologically } from "./transaction-order";
import type { Transaction, TransactionType } from "./types";

const EVENTS: Record<TransactionType, string> = {
  BUY: "Buy",
  SELL: "Sell",
  DIVIDEND: "Dividend",
  DEPOSIT: "Cash_In",
  WITHDRAW: "Cash_Out",
  SPLIT: "Split",
};

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Giao dịch theo định dạng Transactions của Snowball: mở được bằng Excel, import lại được
 * vào app (lệnh trùng tự bỏ qua) hoặc vào Snowball. Giá theo tiền niêm yết như lúc nhập;
 * split ghi hệ số vào cột Price như Snowball.
 */
export function transactionsToCsv(transactions: Transaction[]): string {
  const header = ["Event", "Date", "Symbol", "Price", "Quantity", "Currency", "FeeTax", "Note"];
  const rows = [...transactions].sort(compareTransactionsChronologically).map((t) => {
    const split = t.type === "SPLIT";
    const cash = t.symbol === "CASH";
    return [
      EVENTS[t.type],
      t.date,
      cash ? "" : t.symbol,
      split ? t.quantity : t.price,
      split ? 0 : t.quantity,
      t.currency ?? (cash ? "USD" : ""),
      t.fee,
      t.notes ?? "",
    ]
      .map(cell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}
