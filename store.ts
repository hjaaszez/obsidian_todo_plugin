import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, PluginData, ScheduleEntry, Todo } from "./types";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export class Store {
  data: PluginData = { todos: [], scheduleEntries: [], note: "", diaries: {}, settings: { ...DEFAULT_SETTINGS } };
  /** 日記をMarkdownへ書き出す処理(main.tsが設定する) */
  exporter: ((date: string) => Promise<void>) | null = null;

  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private exportTimer: number | null = null;
  private pendingExports = new Set<string>();

  constructor(private plugin: Plugin) {}

  async load() {
    const raw = (await this.plugin.loadData()) as Partial<PluginData> | null;
    this.data = {
      // 旧データ(isRoutine等が無い)も読めるよう補完する
      todos: (raw?.todos ?? []).map((t) => ({
        ...t,
        isRoutine: t.isRoutine ?? false,
        doneDates: t.doneDates ?? [],
        memo: t.memo ?? "",
      })),
      scheduleEntries: raw?.scheduleEntries ?? [],
      note: raw?.note ?? "",
      diaries: raw?.diaries ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) },
    };
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit() {
    this.listeners.forEach((fn) => fn());
    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.saveNow(), 300);
  }

  private async saveNow() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    await this.plugin.saveData(this.data);
  }

  /** 保存待ち・書き出し待ちを即時実行する */
  async flush() {
    await this.saveNow();
    await this.flushExports();
  }

  // ---- 参照 ----
  getTodo(id: string) {
    return this.data.todos.find((t) => t.id === id);
  }

  /** 指定日時点の完了状態(ルーティンは日付ごと、通常TODOは単一) */
  isDone(todo: Todo, date: string) {
    return todo.isRoutine ? todo.doneDates.includes(date) : todo.isDone;
  }

  routines(): Todo[] {
    return this.data.todos.filter((t) => t.isRoutine);
  }

  /** ルーティン以外を、親→子の順に並べた一覧 */
  ordered(showDone: boolean): { todo: Todo; depth: number }[] {
    const out: { todo: Todo; depth: number }[] = [];
    for (const p of this.data.todos.filter((t) => !t.parentId && !t.isRoutine)) {
      const subs = this.data.todos.filter((t) => t.parentId === p.id);
      const visibleSubs = subs.filter((s) => showDone || !s.isDone);
      if (!showDone && p.isDone && visibleSubs.length === 0) continue;
      out.push({ todo: p, depth: 0 });
      visibleSubs.forEach((s) => out.push({ todo: s, depth: 1 }));
    }
    return out;
  }

  entriesAt(date: string, hour: number): ScheduleEntry[] {
    return this.data.scheduleEntries.filter((e) => e.date === date && e.hour === hour && this.getTodo(e.todoId));
  }

  entriesOn(date: string): ScheduleEntry[] {
    return this.data.scheduleEntries.filter((e) => e.date === date && this.getTodo(e.todoId));
  }

  entriesOf(todoId: string): ScheduleEntry[] {
    return this.data.scheduleEntries
      .filter((e) => e.todoId === todoId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  }

  scheduledCount(todoId: string) {
    return this.entriesOf(todoId).length;
  }

  // ---- 更新 ----
  addTodo(title: string, parentId: string | null = null, isRoutine = false): Todo | null {
    title = title.trim();
    if (!title) return null;
    if (parentId) {
      const parent = this.getTodo(parentId);
      if (!parent || parent.parentId || parent.isRoutine) return null; // サブタスクは1階層・ルーティン配下は不可
      isRoutine = false;
    }
    const todo: Todo = {
      id: uid(),
      title,
      isDone: false,
      parentId,
      isRoutine,
      doneDates: [],
      memo: "",
      createdAt: new Date().toISOString(),
    };
    this.data.todos.push(todo);
    this.commit();
    return todo;
  }

  renameTodo(id: string, title: string) {
    const t = this.getTodo(id);
    title = title.trim();
    if (!t || !title || t.title === title) return;
    t.title = title;
    this.commit();
  }

  toggleTodo(id: string, date: string) {
    const t = this.getTodo(id);
    if (!t) return;
    if (t.isRoutine) {
      t.doneDates = t.doneDates.includes(date) ? t.doneDates.filter((d) => d !== date) : [...t.doneDates, date];
    } else {
      t.isDone = !t.isDone;
    }
    this.commit();
  }

  /** ルーティン化できるのは、親でも子でもないTODOだけ */
  canBeRoutine(id: string) {
    const t = this.getTodo(id);
    return !!t && !t.parentId && !this.data.todos.some((x) => x.parentId === id);
  }

  setRoutine(id: string, on: boolean) {
    const t = this.getTodo(id);
    if (!t || t.isRoutine === on || (on && !this.canBeRoutine(id))) return;
    t.isRoutine = on;
    t.isDone = false;
    t.doneDates = [];
    this.commit();
  }

  /** 入力中の再描画を避けるため通知はしない */
  setMemo(id: string, memo: string) {
    const t = this.getTodo(id);
    if (!t) return;
    t.memo = memo;
    this.scheduleSave();
  }

  deleteTodo(id: string) {
    const ids = new Set([id, ...this.data.todos.filter((t) => t.parentId === id).map((t) => t.id)]);
    this.data.todos = this.data.todos.filter((t) => !ids.has(t.id));
    this.data.scheduleEntries = this.data.scheduleEntries.filter((e) => !ids.has(e.todoId));
    this.commit();
  }

  assign(date: string, hour: number, todoIds: string[]) {
    for (const todoId of todoIds) {
      const dup = this.data.scheduleEntries.some((e) => e.date === date && e.hour === hour && e.todoId === todoId);
      if (!dup) this.data.scheduleEntries.push({ id: uid(), date, hour, todoId });
    }
    this.commit();
  }

  unassign(entryId: string) {
    this.data.scheduleEntries = this.data.scheduleEntries.filter((e) => e.id !== entryId);
    this.commit();
  }

  /** 入力中の再描画を避けるため通知はしない */
  setNote(note: string) {
    this.data.note = note;
    this.scheduleSave();
  }

  /** 日記の更新。保存し、少し待ってからMarkdownへ書き出す */
  setDiary(date: string, text: string) {
    if (text.trim()) this.data.diaries[date] = text;
    else delete this.data.diaries[date];
    this.scheduleSave();
    this.queueExport(date);
  }

  setDiaryFolder(folder: string) {
    this.data.settings.diaryFolder = folder;
    this.scheduleSave();
  }

  private queueExport(date: string) {
    this.pendingExports.add(date);
    if (this.exportTimer !== null) window.clearTimeout(this.exportTimer);
    this.exportTimer = window.setTimeout(() => this.flushExports(), 1000);
  }

  async flushExports() {
    if (this.exportTimer !== null) {
      window.clearTimeout(this.exportTimer);
      this.exportTimer = null;
    }
    const dates = [...this.pendingExports];
    this.pendingExports.clear();
    for (const d of dates) await this.exporter?.(d);
  }
}
