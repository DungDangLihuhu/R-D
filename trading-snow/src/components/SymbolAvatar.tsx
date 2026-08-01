const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(symbol: string) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function tickerLabel(symbol: string) {
  if (symbol === "CASH") return "CASH";
  return symbol.includes(".") ? symbol.split(".")[0] : symbol;
}

export function SymbolAvatar({
  symbol,
  size = "md",
}: {
  symbol: string;
  size?: "sm" | "md";
}) {
  const label = tickerLabel(symbol);
  const sizeClass =
    label.length > 4
      ? "text-[8px]"
      : label.length > 3
        ? "text-[10px]"
        : "text-xs";
  const boxClass = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <div
      className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg px-0.5 font-bold leading-none ${sizeClass} ${avatarColor(symbol)}`}
      title={symbol}
    >
      {label}
    </div>
  );
}
