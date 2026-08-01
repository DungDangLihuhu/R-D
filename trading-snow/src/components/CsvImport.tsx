"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  csvRowsToTransactions,
  parseBrokerCsv,
  type CsvFormat,
  type CsvParseResult,
  type CsvRow,
} from "@/lib/csv-import";
import { formatDate, formatMoney } from "@/lib/format";
import { filterDuplicateTransactions } from "@/lib/transaction-dedup";

const FORMATS: { value: CsvFormat; label: string }[] = [
  { value: "auto", label: "Tự nhận diện" },
  { value: "snowball_holdings", label: "Snowball — Holdings (vị thế)" },
  { value: "snowball_transactions", label: "Snowball — Transactions" },
  { value: "generic", label: "Generic (date,symbol,type,qty,price,fee)" },
  { value: "ibkr", label: "Interactive Brokers" },
  { value: "tradingview", label: "TradingView / Side+Ticker" },
];

export function CsvImport() {
  const { state, activePortfolioId, importTransactions, setMarketPrices } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<CsvFormat>("auto");
  const [preview, setPreview] = useState<CsvRow[] | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [detectedFormat, setDetectedFormat] = useState<CsvFormat>("generic");
  const [open, setOpen] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseBrokerCsv(reader.result as string, format);
      setPreview(result.rows);
      setParseResult(result);
      setErrors(result.errors);
      setDetectedFormat(result.format);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importPreview = useMemo(() => {
    if (!preview || preview.length === 0) return null;
    const txs = csvRowsToTransactions(preview, activePortfolioId);
    return filterDuplicateTransactions(state.transactions, txs);
  }, [preview, activePortfolioId, state.transactions]);

  const confirmImport = () => {
    if (!preview || preview.length === 0 || !importPreview) return;
    const { added, skipped } = importTransactions(importPreview.transactions);

    if (parseResult?.marketPrices && Object.keys(parseResult.marketPrices).length > 0) {
      setMarketPrices(parseResult.marketPrices);
    }

    const parts = [`Đã import ${added} giao dịch`];
    if (skipped > 0) parts.push(`bỏ qua ${skipped} trùng`);
    if (parseResult?.marketPrices) {
      const n = Object.keys(parseResult.marketPrices).length;
      if (n > 0) parts.push(`cập nhật giá ${n} mã`);
    }

    setPreview(null);
    setParseResult(null);
    setErrors([]);
    setOpen(false);
    alert(parts.join(", "));
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
      >
        <FileSpreadsheet className="h-4 w-4" />
        Import CSV broker
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import CSV từ broker</h2>
        <button
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setParseResult(null);
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Đóng
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Snowball: chọn đúng <strong>Holdings</strong> (snapshot vị thế) hoặc{" "}
        <strong>Transactions</strong> (lịch sử). Generic cần cột{" "}
        <code className="text-sky-600">date, symbol, type/side, quantity, price</code>
      </p>

      <div className="flex flex-wrap gap-3">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as CsvFormat)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-400"
        >
          Chọn file CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {parseResult?.info && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          {parseResult.info}
        </p>
      )}

      {preview && importPreview && (
        <p className="text-sm text-sky-600">
          Nhận diện format: <strong>{detectedFormat}</strong> · {preview.length}{" "}
          dòng hợp lệ
          {importPreview.skipped > 0 &&
            ` · ${importPreview.skipped} trùng (sẽ bỏ qua)`}
          {importPreview.transactions.length > 0 &&
            ` · ${importPreview.transactions.length} mới`}
          {parseResult?.marketPrices &&
            Object.keys(parseResult.marketPrices).length > 0 &&
            ` · ${Object.keys(parseResult.marketPrices).length} giá thị trường`}
        </p>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Cảnh báo ({errors.length})</p>
          <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-xs">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && importPreview && importPreview.transactions.length > 0 && (
        <>
          <div className="max-h-48 overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-left">Mã</th>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Giá</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 15).map((r, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-3 py-1.5">{formatDate(r.date)}</td>
                    <td className="px-3 py-1.5">{r.symbol}</td>
                    <td className="px-3 py-1.5 text-center">{r.type}</td>
                    <td className="px-3 py-1.5 text-right">{r.quantity}</td>
                    <td className="px-3 py-1.5 text-right">
                      {formatMoney(r.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={confirmImport}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Xác nhận import {importPreview.transactions.length} giao dịch
          </button>
        </>
      )}

      {preview && importPreview && importPreview.transactions.length === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Tất cả {preview.length} dòng đã tồn tại — không có gì để import.
        </p>
      )}
    </div>
  );
}
