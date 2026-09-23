import type { AppState } from "./types";

/**
 * Dấu vết của bản đã đồng bộ gần nhất với cloud — đủ để phân biệt "máy kia mới thêm"
 * với "máy này đã xóa" khi hai bên cùng đổi. Lệnh và portfolio không bao giờ bị sửa
 * tại chỗ (chỉ thêm/xóa), nên so id là đủ.
 */
export interface SyncBase {
  room: string;
  updatedAt: string;
  transactionIds: string[];
  portfolioIds: string[];
  hiddenSymbols: Record<string, string[]>;
}

export function syncBaseOf(room: string, updatedAt: string, state: AppState): SyncBase {
  return {
    room,
    updatedAt,
    transactionIds: state.transactions.map((t) => t.id),
    portfolioIds: state.portfolios.map((p) => p.id),
    hiddenSymbols: state.hiddenSymbols ?? {},
  };
}

/** Máy mới/trống: chỉ có portfolio mặc định, chưa có lệnh nào — không có gì đáng đẩy lên cloud. */
export function isBlankState(state: AppState): boolean {
  return state.transactions.length === 0 && state.portfolios.length <= 1;
}

/** Lệnh chỉ có ở `local`, không có trên `remote`. */
export function localOnlyTransactionCount(local: AppState, remote: AppState): number {
  const remoteIds = new Set(remote.transactions.map((t) => t.id));
  return local.transactions.filter((t) => !remoteIds.has(t.id)).length;
}

/** Cloud chưa có gì: mọi lệnh/portfolio ở cả hai bên đều tính là mới thêm, không xóa gì. */
export function emptySyncBase(room: string): SyncBase {
  return { room, updatedAt: "", transactionIds: [], portfolioIds: [], hiddenSymbols: {} };
}

function mergeById<T extends { id: string }>(
  baseIds: ReadonlySet<string>,
  local: T[],
  remote: T[]
): T[] {
  const localIds = new Set(local.map((x) => x.id));
  const remoteIds = new Set(remote.map((x) => x.id));
  const merged: T[] = [];

  for (const item of remote) {
    // Có ở cả hai bên, hoặc máy kia mới thêm. Có trong base mà máy này không còn = máy này đã xóa.
    if (localIds.has(item.id) || !baseIds.has(item.id)) merged.push(item);
  }
  for (const item of local) {
    // Máy này mới thêm. Có trong base mà máy kia không còn = máy kia đã xóa.
    if (!remoteIds.has(item.id) && !baseIds.has(item.id)) merged.push(item);
  }
  return merged;
}

function sameSymbols(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((s) => set.has(s));
}

/**
 * Gộp thay đổi của máy này (`local`) với bản trên cloud (`remote`) khi cả hai cùng
 * đổi kể từ `base`: giữ lệnh/portfolio mới thêm ở cả hai bên, bỏ những thứ một bên đã
 * xóa. Giá lấy theo bộ cập nhật sau; danh sách mã ẩn lấy theo bên đã đổi nó.
 */
export function mergeSyncedState(base: SyncBase, local: AppState, remote: AppState): AppState {
  const portfolios = mergeById(new Set(base.portfolioIds), local.portfolios, remote.portfolios);
  const transactions = mergeById(
    new Set(base.transactionIds),
    local.transactions,
    remote.transactions
  );

  const localNewer = (local.pricesUpdatedAt ?? "") > (remote.pricesUpdatedAt ?? "");
  const [older, newer] = localNewer ? [remote, local] : [local, remote];

  const hiddenSymbols: Record<string, string[]> = {};
  const portfolioIds = new Set([
    ...Object.keys(local.hiddenSymbols ?? {}),
    ...Object.keys(remote.hiddenSymbols ?? {}),
  ]);
  for (const id of portfolioIds) {
    const mine = local.hiddenSymbols?.[id] ?? [];
    const pick = sameSymbols(mine, base.hiddenSymbols[id]) ? (remote.hiddenSymbols?.[id] ?? []) : mine;
    if (pick.length > 0) hiddenSymbols[id] = pick;
  }

  return {
    ...remote,
    portfolios: portfolios.length > 0 ? portfolios : remote.portfolios,
    transactions,
    marketPrices: { ...older.marketPrices, ...newer.marketPrices },
    marketQuotes: { ...(older.marketQuotes ?? {}), ...(newer.marketQuotes ?? {}) },
    pricesUpdatedAt: newer.pricesUpdatedAt ?? older.pricesUpdatedAt ?? null,
    hiddenSymbols,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

function normalized(state: AppState) {
  return canonical({
    ...state,
    marketPrices: state.marketPrices ?? {},
    marketQuotes: state.marketQuotes ?? {},
    pricesUpdatedAt: state.pricesUpdatedAt ?? null,
    hiddenSymbols: Object.fromEntries(
      Object.entries(state.hiddenSymbols ?? {}).filter(([, list]) => list.length > 0)
    ),
  });
}

/**
 * So nội dung, bỏ qua thứ tự khóa và khác biệt rỗng/undefined — một bản giống hệt không
 * được đẩy lại lên cloud, nếu không hai máy cùng mở sẽ ghi đè nhau mãi.
 */
export function sameSyncedContent(a: AppState, b: AppState): boolean {
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
