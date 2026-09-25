"use client";

import { useEffect, useRef } from "react";
import { DatabaseBackup, FileJson, FileSpreadsheet, Upload } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { transactionsToCsv } from "@/lib/csv-export";
import { toast } from "@/lib/toast-store";

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "portfolio"
  );
}

const today = () => new Date().toISOString().slice(0, 10);

const itemClass =
  "flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-app-tint";

/**
 * Dữ liệu nằm trong trình duyệt (và cloud nếu bật đồng bộ): xóa dữ liệu trình duyệt là
 * mất hết. Tải bản sao lưu JSON để khôi phục nguyên trạng, hoặc CSV để mở bằng Excel.
 */
export function DataBackup() {
  const { state, activePortfolioId, exportData, importData, cloudConfigured } = useApp();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bấm ra ngoài thì đóng menu.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const close = () => {
    if (menuRef.current) menuRef.current.open = false;
  };

  const backupJson = () => {
    download(`trading-snow-${today()}.json`, exportData(), "application/json");
    toast.success("Đã tải bản sao lưu");
    close();
  };

  const exportCsv = () => {
    const transactions = state.transactions.filter((t) => t.portfolioId === activePortfolioId);
    if (transactions.length === 0) {
      toast.info("Portfolio này chưa có giao dịch");
      return;
    }
    const name = state.portfolios.find((p) => p.id === activePortfolioId)?.name ?? "portfolio";
    // BOM để Excel đọc đúng tiếng Việt trong ghi chú.
    download(
      `trading-snow-${fileSlug(name)}-${today()}.csv`,
      `﻿${transactionsToCsv(transactions)}`,
      "text/csv;charset=utf-8"
    );
    toast.success(`Đã xuất ${transactions.length} giao dịch`);
    close();
  };

  const restore = async (file: File) => {
    const text = await file.text();
    const ok = confirm(
      `Thay toàn bộ dữ liệu trên máy này${cloudConfigured ? " và trên cloud" : ""} bằng bản sao lưu "${file.name}"?\n\nNên tải bản sao lưu hiện tại trước.`
    );
    if (!ok) return;
    if (importData(text)) toast.success("Đã khôi phục dữ liệu từ bản sao lưu");
    else toast.error("File không phải bản sao lưu hợp lệ của Trading Snow");
  };

  return (
    <details ref={menuRef} className="relative">
      <summary className="app-btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <DatabaseBackup className="h-4 w-4" />
        Sao lưu
      </summary>
      <div className="app-popover absolute left-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg p-1">
        <button type="button" onClick={backupJson} className={itemClass}>
          <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
          <span>
            Tải bản sao lưu (.json)
            <span className="block text-xs text-app-muted">Mọi portfolio, lệnh và cài đặt</span>
          </span>
        </button>
        <button type="button" onClick={exportCsv} className={itemClass}>
          <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
          <span>
            Xuất giao dịch (.csv)
            <span className="block text-xs text-app-muted">
              Portfolio đang chọn · mở bằng Excel, import lại được
            </span>
          </span>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={itemClass}>
          <Upload className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
          <span>
            Khôi phục từ bản sao lưu…
            <span className="block text-xs text-app-muted">Thay toàn bộ dữ liệu hiện tại</span>
          </span>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          close();
          if (file) void restore(file);
        }}
      />
    </details>
  );
}
