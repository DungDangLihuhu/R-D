"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  csvRowsToTransactions,
  parseBrokerCsv,
  type CsvFormat,
  type CsvRow,
} from "@/lib/csv-import";
import { formatDate, formatMoney } from "@/lib/format";

const FORMATS: { value: CsvFormat; label: string }[] = [
  { value: "auto", label: "Tự nhận diện" },
  { value: "generic", label: "Generic (date,symbol,type,qty,price,fee)" },
  { value: "ibkr", label: "Interactive Brokers" },
  { value: "tradingview", label: "TradingView / Side+Ticker" },
];

export function CsvImport() {
  const { activePortfolioId, importTransactions } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<CsvFormat>("auto");
  const [preview, setPreview] = useState<CsvRow[] | null>(null);
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
      setErrors(result.errors);
      setDetectedFormat(result.format);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = () => {
    if (!preview || preview.length === 0) return;
    const txs = csvRowsToTransactions(preview, activePortfolioId);
    importTransactions(txs);
    setPreview(null);
    setErrors([]);
    setOpen(false);
    alert(`Đã import ${txs.length} giao dịch`);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
      >
        <FileSpreadsheet className="h-4 w-4" />
        Import CSV broker
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import CSV từ broker</h2>
        <button
          onClick={() => {
            setOpen(false);
            setPreview(null);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Đóng
        </button>
      </div>

      <p className="text-sm text-zinc-500">
        Hỗ trợ: Generic, Interactive Brokers, TradingView. Cột tối thiểu:{" "}
        <code className="text-sky-400">date, symbol, type/side, quantity, price</code>
      </p>

      <div className="flex flex-wrap gap-3">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as CsvFormat)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
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

      {preview && (
        <p className="text-sm text-sky-400">
          Nhận diện format: <strong>{detectedFormat}</strong> · {preview.length}{" "}
          dòng hợp lệ
        </p>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-medium">Cảnh báo ({errors.length})</p>
          <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-xs">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && preview.length > 0 && (
        <>
          <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-zinc-400">
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
                  <tr key={i} className="border-t border-zinc-800">
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
            Xác nhận import {preview.length} giao dịch
          </button>
        </>
      )}
    </div>
  );
}
