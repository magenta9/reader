import type { HistoryRetention } from "../shared/app-contracts.js";

export function historyRetentionLabel(retention: HistoryRetention): string {
  if (retention === "7d") return "7 天";
  if (retention === "3m") return "3 个月";
  if (retention === "forever") return "永久";
  return "1 个月";
}
