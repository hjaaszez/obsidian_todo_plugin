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
}

export const HOURS = Array.from({ length: 20 }, (_, i) => i + 5); // 5〜24

export const DEFAULT_SETTINGS: Settings = { diaryFolder: "TODO Schedule/Diary" };
