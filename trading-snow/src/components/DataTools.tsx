"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";

export function DataTools() {
  const { addPortfolio, clearAllTransactions, state } = useApp();
  const nameRef = useRef<HTMLInputElement>(null);

  const handleClearAll = () => {
    if (state.transactions.length === 0) {
      alert("Không có giao dịch để xóa");
      return;
    }

    const ok = confirm(
      `Xóa TẤT CẢ ${state.transactions.length} giao dịch?\n\nHành động không hoàn tác.`
    );
    if (!ok) return;

    clearAllTransactions();
    alert("Đã xóa toàn bộ lịch sử giao dịch");
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handleClearAll}
        className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 shadow-sm hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" /> Xóa tất cả giao dịch
      </button>
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
