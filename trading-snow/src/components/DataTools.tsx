"use client";

import { useRef } from "react";
import { useApp } from "@/context/AppContext";

export function DataTools() {
  const { addPortfolio } = useApp();
  const nameRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex gap-2">
        <input
          ref={nameRef}
          placeholder="Tên portfolio mới"
          className="app-input"
        />
        <button
          onClick={() => {
            const name = nameRef.current?.value.trim();
            if (name) {
              addPortfolio(name, "USD");
              if (nameRef.current) nameRef.current.value = "";
            }
          }}
          className="app-btn-secondary"
        >
          + Portfolio
        </button>
      </div>
    </div>
  );
}
