export interface Todo {
  id: string;
  title: string;
  isDone: boolean; // 通常TODOの完了状態(ルーティンでは使わない)
  parentId: string | null;
  isRoutine: boolean; // ルーティン: 完了しても消えず、毎日選び直せる
  doneDates: string[]; // ルーティンの「完了した日」 "YYYY-MM-DD"
  memo: string; // タスク(チケット)ごとのメモ
  repeatRule?: string; // 将来対応
  createdAt: string;
  updatedAt: number; // 端末間マージ用(ミリ秒)。新しい方が勝つ
}

export interface ScheduleEntry {
  id: string;
  date: string; // "YYYY-MM-DD"
  hour: number; // 5〜24
  todoId: string;
}

export interface Settings {
  diaryFolder: string; // 日記Markdownの書き出し先(Vault内のフォルダ)
}

export interface PluginData {
  todos: Todo[];
  scheduleEntries: ScheduleEntry[];
  note: string;
  diaries: Record<string, string>; // 日付 → 日記本文
  settings: Settings;
  // ---- 端末間同期(マージ)用 ----
  tombstones: Record<string, number>; // 削除したID → 削除時刻。削除を他端末へ伝える
  noteUpdatedAt: number;
  diaryUpdatedAt: Record<string, number>; // 日付 → 日記の最終更新時刻
  settingsUpdatedAt: number;
}

export const HOURS = Array.from({ length: 20 }, (_, i) => i + 5); // 5〜24

export const DEFAULT_SETTINGS: Settings = { diaryFolder: "TODO Schedule/Diary" };
