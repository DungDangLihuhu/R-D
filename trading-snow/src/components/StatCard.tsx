export function StatCard({
  label,
  value,
  sub,
  trend,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  const trendColor =
    trend === "up"
      ? "text-emerald-600 glow-profit"
      : trend === "down"
        ? "text-rose-600 glow-loss"
        : "text-app-text";

  return (
    <div className={`app-card app-card-static ${className}`}>
      <p className="text-xs font-medium text-app-muted">{label}</p>
      {/* Co giãn theo bề rộng: hai cột trên mobile không đủ chỗ cho số tiền 6 chữ số. */}
      <p
        className={`mt-1 text-[clamp(0.95rem,4.4vw,1.5rem)] font-semibold tabular-nums ${trendColor}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
