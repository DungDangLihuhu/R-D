"use client";

import { useRef } from "react";
import { Download, Upload } from "lucide-react";
import { useApp } from "@/context/AppContext";

export function DataTools() {
  const { exportData, importData, addPortfolio } = useApp();
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
        className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
      >
        <Download className="h-4 w-4" /> Export JSON
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900"
      >
        <Upload className="h-4 w-4" /> Import JSON
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
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <button
          onClick={() => {
            const name = nameRef.current?.value.trim();
            if (name) {
              addPortfolio(name, "USD");
              if (nameRef.current) nameRef.current.value = "";
            }
          }}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
        >
          + Portfolio
        </button>
      </div>
    </div>
  );
}
