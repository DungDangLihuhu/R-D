/**
 * Điểm nạp lười chung cho mọi biểu đồ Recharts: luôn `import("@/components/charts-bundle")`,
 * không import thẳng từng file biểu đồ. Mỗi lệnh import() khác nhau là một nhóm chunk, và
 * Turbopack đóng cho mỗi nhóm một bản Recharts (~110 KB gzip) riêng, khác hash — trang
 * Thống kê từng tải hai bản, sang trang cổ phiếu tải bản thứ ba. Chung một điểm nạp thì cả
 * app chỉ còn một file, tải một lần rồi dùng lại.
 */
export { BenchmarkComparison } from "@/components/BenchmarkComparison";
export { BenDangChart } from "@/components/BenDangChart";
export { EquityChart, MonthlyPnlChart } from "@/components/Charts";
export { StockPriceChart } from "@/components/StockPriceChart";
