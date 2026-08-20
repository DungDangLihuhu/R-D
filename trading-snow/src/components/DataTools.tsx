"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";

export function DataTools() {
  const { addPortfolio } = useApp();
  const nameRef = useRef<HTMLInputElement>(null);

  const create = () => {
    const name = nameRef.current?.value.trim();
    if (!name) return;
    addPortfolio(name, "USD");
    if (nameRef.current) nameRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex gap-2">
        <input
          ref={nameRef}
          placeholder="Tên portfolio mới"
          className="app-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
        />
        <button type="button" onClick={create} className="app-btn-secondary">
          <Plus className="h-4 w-4" />
          Portfolio
        </button>
      </div>
    </div>
  );
}
