"use client";

import { AlertTriangle, Download, RotateCcw } from "lucide-react";
import { downloadLocalBackup } from "@/lib/storage";

export function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
}) {
  return (
    <div className="app-empty" role="alert">
      <span className="app-empty-icon">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="font-medium text-app-text">Trang này gặp lỗi</p>
      <p className="mt-1 max-w-md text-sm text-app-muted">
        Dữ liệu vẫn còn trong máy. Thử tải lại; nếu vẫn lỗi, tải bản sao lưu về trước khi
        xử lý tiếp.
      </p>
      {error.message && (
        <p className="mt-2 max-w-md break-words text-xs text-app-faint">{error.message}</p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onRetry} className="app-btn-primary">
          <RotateCcw className="h-4 w-4" />
          Thử lại
        </button>
        <button type="button" onClick={downloadLocalBackup} className="app-btn-secondary">
          <Download className="h-4 w-4" />
          Tải bản sao lưu
        </button>
      </div>
    </div>
  );
}
