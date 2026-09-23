"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import "./globals.css";

/**
 * Lỗi ở root layout (AppProvider tính số liệu, AppShell): thay cả trang, nên tự dựng
 * <html>/<body> và nạp lại CSS toàn cục.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <title>Trading Snow — lỗi</title>
        <main className="mx-auto max-w-xl px-4 py-16">
          <ErrorFallback error={error} onRetry={unstable_retry} />
        </main>
      </body>
    </html>
  );
}
