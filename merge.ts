import { DEFAULT_SETTINGS, PluginData, ScheduleEntry, Todo } from "./types";

const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000; // 削除記録は90日で破棄

/** 保存ファイルの中身を、欠けた項目を補った PluginData にそろえる(古い形式も読める) */
export function normalizeData(raw: Partial<PluginData> | null | undefined): PluginData {
  const todos: Todo[] = (raw?.todos ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    isDone: t.isDone ?? false,
    parentId: t.parentId ?? null,
    isRoutine: t.isRoutine ?? false,
    doneDates: [...(t.doneDates ?? [])].sort(),
    memo: t.memo ?? "",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? (Date.parse(t.createdAt) || 0),
  }));
  return {
    todos,
    scheduleEntries: raw?.scheduleEntries ?? [],
    note: raw?.note ?? "",
    diaries: raw?.diaries ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) },
    tombstones: raw?.tombstones ?? {},
    noteUpdatedAt: raw?.noteUpdatedAt ?? 0,
    diaryUpdatedAt: raw?.diaryUpdatedAt ?? {},
    settingsUpdatedAt: raw?.settingsUpdatedAt ?? 0,
  };
}

const sortedRecord = <T>(r: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(r).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));

/**
 * 2つの端末のデータをマージする(a=手元、b=他端末)。
 * - TODO: 同じIDは updatedAt の新しい方。削除記録があれば復活させない
 * - 割り当て: IDの和集合。削除記録・親TODOの消えたものは除外
 * - メモ・日記・設定: 更新時刻の新しい方(同時刻なら a)
 * 出力は並び順・キー順を固定するので、同じ内容なら同じJSONになる。
 */
export function mergeData(a: PluginData, b: PluginData): PluginData {
  const now = Date.now();

  // 削除記録(大きい方の時刻を採用し、古いものは破棄)
  const tombstones: Record<string, number> = {};
  for (const src of [b.tombstones, a.tombstones]) {
    for (const [id, ts] of Object.entries(src)) {
      if (now - ts > TOMBSTONE_TTL) continue;
      tombstones[id] = Math.max(tombstones[id] ?? 0, ts);
    }
  }

  // TODO
  const todoMap = new Map<string, Todo>();
  for (const t of [...b.todos, ...a.todos]) {
    if (tombstones[t.id]) continue;
    const cur = todoMap.get(t.id);
    if (!cur || t.updatedAt >= cur.updatedAt) todoMap.set(t.id, t);
  }
  for (const [id, t] of todoMap) {
    if (t.parentId && !todoMap.has(t.parentId)) todoMap.delete(id); // 親が消えたサブタスク
  }
  const todos = [...todoMap.values()].sort((x, y) =>
    x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : x.id < y.id ? -1 : 1
  );

  // スケジュール割り当て
  const entryMap = new Map<string, ScheduleEntry>();
  for (const e of [...b.scheduleEntries, ...a.scheduleEntries]) {
    if (tombstones[e.id] || !todoMap.has(e.todoId)) continue;
    entryMap.set(e.id, e);
  }
  const scheduleEntries = [...entryMap.values()].sort(
    (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.hour - y.hour || (x.id < y.id ? -1 : 1))
  );

  // 共通メモ
  const noteFromA = a.noteUpdatedAt >= b.noteUpdatedAt;

  // 日記(日付ごと)
  const diaries: Record<string, string> = {};
  const diaryUpdatedAt: Record<string, number> = {};
  const dates = new Set([
    ...Object.keys(a.diaries),
    ...Object.keys(b.diaries),
    ...Object.keys(a.diaryUpdatedAt),
    ...Object.keys(b.diaryUpdatedAt),
  ]);
  for (const d of dates) {
    const ua = a.diaryUpdatedAt[d] ?? 0;
    const ub = b.diaryUpdatedAt[d] ?? 0;
    const pickA = ua > ub || (ua === ub && (!!a.diaries[d] || !b.diaries[d]));
    const src = pickA ? a : b;
    if (src.diaries[d]) diaries[d] = src.diaries[d];
    diaryUpdatedAt[d] = Math.max(ua, ub);
  }

  const settingsFromA = a.settingsUpdatedAt >= b.settingsUpdatedAt;

  return {
    todos,
    scheduleEntries,
    note: noteFromA ? a.note : b.note,
    diaries: sortedRecord(diaries),
    settings: { ...(settingsFromA ? a.settings : b.settings) },
    tombstones: sortedRecord(tombstones),
    noteUpdatedAt: Math.max(a.noteUpdatedAt, b.noteUpdatedAt),
    diaryUpdatedAt: sortedRecord(diaryUpdatedAt),
    settingsUpdatedAt: Math.max(a.settingsUpdatedAt, b.settingsUpdatedAt),
  };
}

/** 内容の同一判定用(mergeData を通したデータ同士で比較する) */
export const canon = (d: PluginData) => mergeData(d, d);
export const sig = (d: PluginData) => JSON.stringify(d);
