/** Khung chờ lúc mở trang, trước khi đọc xong dữ liệu trong máy — thay vì chớp số 0. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Đang tải dữ liệu…</span>
      <div className="space-y-2">
        <div className="app-skeleton h-7 w-40 rounded-lg" />
        <div className="app-skeleton h-4 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-skeleton h-28" />
        ))}
      </div>
      <div className="app-skeleton h-72" />
    </div>
  );
}
