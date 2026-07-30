# Trading Snow

Web app nhập & thống kê dữ liệu trading (kiểu Snowball Analytics) — chạy local, lưu trên trình duyệt.

## Tính năng

- **Portfolio** — nhiều danh mục, chuyển đổi nhanh
- **Giao dịch** — Mua / Bán / Cổ tức / Nạp / Rút
- **Danh mục** — vị thế mở, giá vốn TB, cập nhật giá TT thủ công
- **Thống kê** — P&L, win rate, profit factor, equity curve, P&L theo tháng
- **Export / Import JSON** — backup dữ liệu

## Chạy

```bash
cd trading-snow
npm install
npm run dev
```

Mở http://localhost:3000

## Cấu trúc

| Trang | Mô tả |
|-------|--------|
| `/` | Dashboard tổng quan |
| `/trades` | Nhập & xem giao dịch |
| `/portfolio` | Holdings đang giữ |
| `/analytics` | Biểu đồ & lệnh đã chốt |

Dữ liệu lưu `localStorage` key `trading-snow-state-v1`.

## Roadmap (có thể mở rộng)

- API giá realtime (Yahoo, Polygon…)
- Import CSV broker
- Dividend calendar
- So sánh benchmark (S&P 500)
- Backend + đăng nhập
