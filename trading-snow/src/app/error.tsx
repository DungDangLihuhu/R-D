"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";

/** Lỗi trong một trang: header và thanh nav vẫn còn để chuyển sang trang khác. */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorFallback error={error} onRetry={unstable_retry} />;
}
