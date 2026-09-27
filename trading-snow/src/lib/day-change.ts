import type { MarketQuote } from "./types";

/**
 * Biến động cả ngày của một mã so với giá đóng cửa hôm trước. Sau giờ đóng cửa, `change`
 * của Yahoo chỉ là phần sau giờ — cộng thêm biến động phiên chính, không thì cổ phiếu
 * giảm 0,8% trong phiên vẫn hiện "hôm nay 0%". Trước giờ mở cửa, `change` đã so với giá
 * đóng cửa hôm trước.
 */
export function dayChange(quote: MarketQuote): { change: number; changePercent: number } {
  if (quote.marketSession === "post" && quote.regularChange != null) {
    const change = quote.regularChange + quote.change;
    const previousClose = quote.price - change;
    return {
      change,
      changePercent: previousClose > 0 ? (change / previousClose) * 100 : 0,
    };
  }
  return { change: quote.change, changePercent: quote.changePercent };
}

/**
 * Giá phiên chính: giá khớp trong phiên, hoặc giá đóng cửa khi đang pre/post-market. Chỉ số
 * như S&P 500 chỉ có giá phiên chính, nên so sánh với nó mà lấy giá ngoài giờ của danh mục
 * là cộng thêm cho danh mục biến động mà chỉ số chưa có.
 */
export function regularSessionPrice(quote: MarketQuote): number {
  if (quote.marketSession !== "pre" && quote.marketSession !== "post") return quote.price;
  // Dữ liệu cũ chưa lưu giá phiên chính: `change` ngoài giờ tính từ giá đóng cửa đó.
  return quote.regularPrice ?? quote.price - quote.change;
}
