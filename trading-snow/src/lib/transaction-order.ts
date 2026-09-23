import type { Transaction, TransactionType } from "./types";

/**
 * Lệnh cùng một mốc thời gian (thường là cùng ngày, không có giờ) chạy theo thứ tự
 * nạp → split → mua → bán → cổ tức → rút. Không có thứ tự phụ này thì file CSV xếp
 * mới nhất lên đầu sẽ bán trước khi mua: giá vốn 0, cả tiền bán thành lãi, còn lại vị
 * thế ma. Split có hiệu lực từ đầu phiên nên lệnh khớp cùng ngày đã là số cổ sau split.
 */
const SAME_TIME_ORDER: Record<TransactionType, number> = {
  DEPOSIT: 0,
  SPLIT: 1,
  BUY: 2,
  SELL: 3,
  DIVIDEND: 4,
  WITHDRAW: 5,
};

export function compareTransactionsChronologically(
  a: Pick<Transaction, "date" | "type">,
  b: Pick<Transaction, "date" | "type">
): number {
  return (
    a.date.localeCompare(b.date) || SAME_TIME_ORDER[a.type] - SAME_TIME_ORDER[b.type]
  );
}
