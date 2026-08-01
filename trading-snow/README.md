# Trading Snow

Web app nhập & thống kê dữ liệu trading (kiểu Snowball Analytics).

## Tính năng

| Module | Mô tả |
|--------|--------|
| **Portfolio** | Nhiều danh mục, chuyển đổi nhanh |
| **Giao dịch** | Mua/Bán/Cổ tức/Nạp/Rút + **Import CSV broker** |
| **Giá realtime** | Yahoo Finance API, auto-refresh 5 phút |
| **Danh mục** | Vị thế mở, P&L chưa chốt theo giá live |
| **Lịch cổ tức** | Đã nhận + dự kiến (Yahoo) |
| **Thống kê** | Win rate, profit factor, equity curve |
| **Backup** | Export/Import JSON |

## Chạy local

```bash
cd trading-snow
npm install
npm run dev
```

→ http://localhost:3000

## Import CSV

Hỗ trợ format:

- **Generic**: `date, symbol, type, quantity, price, fee` (+ tùy chọn `exchange`, `country`)
- **Snowball Holdings**: tự map `Country` / `Exchange` → mã Yahoo (vd. SAN + France → `SAN.PA`)
- **Interactive Brokers**: `TradeDate, Symbol, Buy/Sell, Quantity, TradePrice, IBCommission`
- **TradingView**: `Date, Ticker, Side, Qty, Price, Commission`

Type: `buy/sell/dividend` hoặc `mua/bán`

## API nội bộ

| Route | Mô tả |
|-------|--------|
| `GET /api/quotes?symbols=AAPL,MU` | Giá realtime Yahoo |
| `GET /api/dividends?symbols=AAPL,MU` | Lịch cổ tức Yahoo |

## Deploy online — gợi ý

### 1. **Vercel** (tiện nhất cho Next.js)

- Free tier đủ dùng cá nhân
- Connect GitHub → auto deploy mỗi push
- API routes (`/api/quotes`) chạy serverless sẵn

```bash
npm i -g vercel
cd trading-snow
vercel
```

Hoặc: [vercel.com](https://vercel.com) → Import repo → Root Directory: `trading-snow`

### 2. **Netlify** — tương tự Vercel, free tier tốt

### 3. **Cloudflare Pages** — nhanh, free, hỗ trợ Next.js

### 4. **Railway / Render** — nếu cần server lâu dài, ít cold start

### Lưu ý khi deploy

- Dữ liệu vẫn lưu **localStorage trên trình duyệt** — mỗi user/máy riêng
- Muốn sync đa thiết bị → cần thêm backend (Supabase, Firebase, Postgres)
- Yahoo Finance API không chính thức — có thể rate-limit; production nên cache (đã set `revalidate`)

## Cấu trúc

```
src/app/
  page.tsx          Dashboard
  trades/           Giao dịch + CSV import
  portfolio/        Holdings + giá live
  dividends/        Lịch cổ tức
  analytics/        Biểu đồ
  api/quotes/       Proxy Yahoo giá
  api/dividends/    Proxy Yahoo cổ tức
```
