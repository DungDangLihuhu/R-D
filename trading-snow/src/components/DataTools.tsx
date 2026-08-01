"use client";

import { useRef } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { useApp } from "@/context/AppContext";

export function DataTools() {
  const { exportData, importData, addPortfolio, clearAllTransactions, state } =
    useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importData(reader.result as string);
      alert(ok ? "Import thành công" : "File không hợp lệ");
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    if (state.transactions.length === 0) {
      alert("Không có giao dịch để xóa");
      return;
    }

    const ok = confirm(
      `Xóa TẤT CẢ ${state.transactions.length} giao dịch?\n\nHành động không hoàn tác. Nên Export JSON trước khi xóa.`
    );
    if (!ok) return;

    clearAllTransactions();
    alert("Đã xóa toàn bộ lịch sử giao dịch");
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => {
          const blob = new Blob([exportData()], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `trading-snow-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
        }}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
      >
        <Download className="h-4 w-4" /> Export JSON
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
      >
        <Upload className="h-4 w-4" /> Import JSON
      </button>
      <button
        onClick={handleClearAll}
        className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 shadow-sm hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" /> Xóa tất cả giao dịch
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
      <div className="flex gap-2">
        <input
          ref={nameRef}
          placeholder="Tên portfolio mới"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        <button
          onClick={() => {
            const name = nameRef.current?.value.trim();
            if (name) {
              addPortfolio(name, "USD");
              if (nameRef.current) nameRef.current.value = "";
            }
          }}
          className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          + Portfolio
        </button>
      </div>
    </div>
  );
}
