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
