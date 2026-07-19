import type { FavoriteRecord, ReadingHistoryRecord } from "./bridge.js";

export type RecordGroupLabel = "今天" | "昨天" | "本周" | "更早";

export interface RecordGroup<T> {
  label: RecordGroupLabel;
  records: T[];
}

export function groupHistoryRecords(records: ReadingHistoryRecord[], now = Date.now()): RecordGroup<ReadingHistoryRecord>[] {
  return groupRecordsByTime(records, (record) => record.createdAt, now);
}

export function groupFavoriteRecords(records: FavoriteRecord[], now = Date.now()): RecordGroup<FavoriteRecord>[] {
  return groupRecordsByTime(records, (record) => record.favoritedAt, now);
}

export function resolveSelectedRecordId<T extends { id: string }>(
  records: T[],
  currentId: string | undefined,
  preferredId?: string
): string | undefined {
  if (preferredId && records.some((record) => record.id === preferredId)) return preferredId;
  if (currentId && records.some((record) => record.id === currentId)) return currentId;
  return undefined;
}

export function resolveAdjacentSelectionAfterDelete<T extends { id: string }>(
  records: T[],
  deletedId: string
): string | undefined {
  const currentIndex = records.findIndex((record) => record.id === deletedId);
  if (currentIndex < 0) return records[0]?.id;
  return records[currentIndex + 1]?.id ?? records[currentIndex - 1]?.id;
}

function groupRecordsByTime<T>(
  records: T[],
  getTime: (record: T) => number,
  now = Date.now()
): RecordGroup<T>[] {
  const buckets: Record<RecordGroupLabel, T[]> = {
    今天: [],
    昨天: [],
    本周: [],
    更早: []
  };
  for (const record of records) {
    buckets[classifyRecordTime(getTime(record), now)].push(record);
  }
  return (["今天", "昨天", "本周", "更早"] as const)
    .map((label) => ({
      label,
      records: buckets[label].sort((a, b) => getTime(b) - getTime(a))
    }))
    .filter((group) => group.records.length);
}

function classifyRecordTime(createdAt: number, now: number): RecordGroupLabel {
  const today = startOfDay(new Date(now));
  const yesterday = today - 24 * 60 * 60 * 1000;
  const weekStart = today - ((new Date(now).getDay() + 6) % 7) * 24 * 60 * 60 * 1000;
  if (createdAt >= today) return "今天";
  if (createdAt >= yesterday) return "昨天";
  if (createdAt >= weekStart) return "本周";
  return "更早";
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
