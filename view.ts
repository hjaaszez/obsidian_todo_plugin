import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { diaryPath, exportDiary } from "./diary";
import { ConfirmModal, SelectTodoModal, TodoDetailModal } from "./modals";
import { Store } from "./store";
import { HOURS, Todo } from "./types";
import { WEEK, pad, parseDate, toDateStr } from "./util";

export const VIEW_TYPE = "todo-schedule-view";

type Tab = "schedule" | "todos" | "diary";

export class TodoScheduleView extends ItemView {
  private tab: Tab = "schedule";
  private date = toDateStr(new Date());
  private showDone = true;
  private noteEditing = false;
  private editingId: string | null = null;
  private addingSubOf: string | null = null;
  private newIsRoutine = false;
  private refocus: string | null = null;
  private root!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private store: Store) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "TODO Schedule";
  }
  getIcon() {
    return "calendar-check";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("ts-host");
    this.root = this.contentEl.createDiv("ts-root");
    this.register(
      this.store.onChange(() => {
        // 入力中(テキストエリアにフォーカス中)に同期で再描画すると入力が途切れるので見送る
        const a = document.activeElement;
        if (a instanceof HTMLTextAreaElement && this.root.contains(a)) return;
        this.render();
      })
    );
    this.render();
  }

  async onClose() {
    await this.store.flush();
  }

  // ================= 共通 =================
  private render() {
    const root = this.root;
    root.empty();

    const nav = root.createDiv("ts-nav");
    const brand = nav.createDiv("ts-brand");
    setIcon(brand.createSpan("ts-brand-icon"), "calendar-check");
    brand.createSpan({ text: "TODO Schedule" });
    const tabs = nav.createDiv("ts-tabs");
    this.tabButton(tabs, "schedule", "スケジュール", "calendar-days");
    this.tabButton(tabs, "todos", "TODO", "list-checks");
    this.tabButton(tabs, "diary", "日記", "book-open");

    const body = root.createDiv("ts-body");
    if (this.tab === "schedule") this.renderSchedule(body);
    else if (this.tab === "todos") this.renderTodos(body);
    else this.renderDiary(body);

    if (this.refocus) {
      root.querySelector<HTMLInputElement>(this.refocus)?.focus();
      this.refocus = null;
    }
  }

  private tabButton(parent: HTMLElement, tab: Tab, label: string, icon: string) {
    const b = parent.createEl("button", { cls: "ts-tab" });
    if (this.tab === tab) b.addClass("is-active");
    setIcon(b.createSpan("ts-tab-icon"), icon);
    b.createSpan({ text: label });
    b.addEventListener("click", () => {
      this.tab = tab;
      this.render();
    });
  }

  /** チェックボックス。日付は「どの日の完了か」(ルーティン用)を表す */
  private checkbox(parent: HTMLElement, todo: Todo, date: string) {
    const cb = parent.createEl("input", { type: "checkbox", cls: "ts-cb" });
    cb.checked = this.store.isDone(todo, date);
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => this.store.toggleTodo(todo.id, date));
    return cb;
  }

  private lozenge(parent: HTMLElement, done: boolean) {
    parent.createSpan({
      text: done ? "完了" : "未完了",
      cls: "ts-lozenge " + (done ? "ts-lozenge-done" : "ts-lozenge-todo"),
    });
  }

  private routineLozenge(parent: HTMLElement) {
    const l = parent.createSpan({ cls: "ts-lozenge ts-lozenge-routine" });
    setIcon(l.createSpan("ts-lozenge-icon"), "repeat");
    l.createSpan({ text: "ルーティン" });
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void, cls = "") {
    const b = parent.createEl("button", { cls: `ts-icon-btn ${cls}`, attr: { "aria-label": label, title: label } });
    setIcon(b, icon);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private openDetail(todo: Todo, date: string) {
    new TodoDetailModal(this.app, this.store, todo.id, date).open();
  }

  /** 日付ナビ付きのページ見出し(スケジュール・日記で共通) */
  private renderDateHead(body: HTMLElement, crumb: string) {
    const today = toDateStr(new Date());
    const d = parseDate(this.date);
    const head = body.createDiv("ts-page-head");
    const titleBox = head.createDiv();
    titleBox.createDiv({ text: crumb, cls: "ts-crumb" });
    titleBox.createEl("h2", { text: `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})` });

    const ctl = head.createDiv("ts-date-ctl");
    this.iconButton(ctl, "chevron-left", "前日", () => this.shiftDate(-1), "ts-btn-bordered");
    ctl.createEl("button", { text: "今日", cls: "ts-btn" }).addEventListener("click", () => {
      this.date = today;
      this.render();
    });
    this.iconButton(ctl, "chevron-right", "翌日", () => this.shiftDate(1), "ts-btn-bordered");
    const picker = ctl.createEl("input", { type: "date", cls: "ts-date-input" });
    picker.value = this.date;
    picker.addEventListener("change", () => {
      if (picker.value) {
        this.date = picker.value;
        this.render();
      }
    });
  }

  private shiftDate(delta: number) {
    const d = parseDate(this.date);
    d.setDate(d.getDate() + delta);
    this.date = toDateStr(d);
    this.render();
  }

  // ================= スケジュール =================
  private renderSchedule(body: HTMLElement) {
    const store = this.store;
    const today = toDateStr(new Date());
    this.renderDateHead(body, this.date === today ? "今日のスケジュール" : "スケジュール");

    // 進捗バー
    const entries = store.entriesOn(this.date);
    const done = entries.filter((e) => store.isDone(store.getTodo(e.todoId)!, this.date)).length;
    const prog = body.createDiv("ts-progress");
    const pct = entries.length ? Math.round((done / entries.length) * 100) : 0;
    prog.createDiv({ text: `進捗 ${done} / ${entries.length}(${pct}%)`, cls: "ts-progress-label" });
    prog.createDiv("ts-progress-bar").createDiv("ts-progress-fill").style.width = `${pct}%`;

    const grid = body.createDiv("ts-grid");
    const board = grid.createDiv("ts-board");
    const nowHour = new Date().getHours();

    for (const hour of HOURS) {
      const row = board.createDiv("ts-row");
      if (this.date === today && hour === nowHour) row.addClass("is-now");
      row.createDiv({ text: `${pad(hour)}:00`, cls: "ts-time" });
      const cell = row.createDiv("ts-cell");
      cell.setAttr("role", "button");
      cell.addEventListener("click", () => new SelectTodoModal(this.app, store, this.date, hour).open());

      for (const entry of store.entriesAt(this.date, hour)) {
        const todo = store.getTodo(entry.todoId)!;
        const isDone = store.isDone(todo, this.date);
        const card = cell.createDiv("ts-card");
        if (isDone) card.addClass("is-done");
        if (todo.isRoutine) card.addClass("is-routine");
        // カードをクリックすると詳細を開く(スロット選択は開かない)
        card.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openDetail(todo, this.date);
        });
        this.checkbox(card, todo, this.date);
        const text = card.createDiv("ts-card-text");
        text.createDiv({ text: todo.title, cls: "ts-title" + (isDone ? " is-done" : "") });
        const parent = todo.parentId ? store.getTodo(todo.parentId) : null;
        if (parent) text.createDiv({ text: parent.title, cls: "ts-parent-tag" });
        if (todo.memo.trim()) setIcon(card.createSpan("ts-memo-mark"), "sticky-note");
        if (todo.isRoutine) this.routineLozenge(card);
        this.lozenge(card, isDone);
        this.iconButton(card, "x", "スロットから外す", () => store.unassign(entry.id));
      }
      setIcon(cell.createDiv("ts-cell-add").createSpan(), "plus");
    }

    this.renderNote(grid.createDiv("ts-side"));
  }

  private renderNote(parent: HTMLElement) {
    const panel = parent.createDiv("ts-panel");
    panel.createDiv({ text: "メモ", cls: "ts-panel-title" });
    if (this.noteEditing) {
      const ta = panel.createEl("textarea", { cls: "ts-note-edit", attr: { placeholder: "URLなどを自由に貼り付け" } });
      ta.value = this.store.data.note;
      ta.addEventListener("input", () => this.store.setNote(ta.value));
      ta.addEventListener("blur", () => {
        this.noteEditing = false;
        this.render();
      });
      window.setTimeout(() => ta.focus(), 0);
    } else {
      const view = panel.createDiv("ts-note-view");
      const note = this.store.data.note;
      if (!note) view.createSpan({ text: "クリックして編集…", cls: "ts-muted" });
      else this.linkify(view, note);
      view.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        this.noteEditing = true;
        this.render();
      });
    }
  }

  private linkify(el: HTMLElement, text: string) {
    const re = /https?:\/\/[^\s<>"']+/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      const idx = m.index ?? 0;
      if (idx > last) el.appendText(text.slice(last, idx));
      el.createEl("a", { text: m[0], href: m[0], cls: "external-link", attr: { target: "_blank", rel: "noopener" } });
      last = idx + m[0].length;
    }
    if (last < text.length) el.appendText(text.slice(last));
  }

  // ================= TODOリスト =================
  private renderTodos(body: HTMLElement) {
    const store = this.store;
    const head = body.createDiv("ts-page-head");
    const t = head.createDiv();
    t.createDiv({ text: "TODOプール", cls: "ts-crumb" });
    t.createEl("h2", { text: "TODO" });
    const lbl = head.createEl("label", { cls: "ts-check-label" });
    const cb = lbl.createEl("input", { type: "checkbox" });
    cb.checked = this.showDone;
    lbl.appendText("完了済みを表示");
    cb.addEventListener("change", () => {
      this.showDone = cb.checked;
      this.render();
    });

    // 作成フォーム
    const form = body.createDiv("ts-create");
    const input = form.createEl("input", { type: "text", cls: "ts-create-input", placeholder: "TODOを追加…" });
    const rl = form.createEl("label", { cls: "ts-check-label ts-nowrap" });
    const rcb = rl.createEl("input", { type: "checkbox" });
    rcb.checked = this.newIsRoutine;
    rcb.addEventListener("change", () => (this.newIsRoutine = rcb.checked));
    rl.appendText("ルーティン");
    const submit = () => {
      if (store.addTodo(input.value, null, this.newIsRoutine)) this.refocus = ".ts-create-input";
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) submit();
    });
    form.createEl("button", { text: "作成", cls: "ts-btn-primary" }).addEventListener("click", submit);

    // ルーティン
    const routines = store.routines();
    if (routines.length > 0) {
      body.createDiv({ text: `ルーティン(${routines.length})`, cls: "ts-section-title" });
      const rlist = body.createDiv("ts-list");
      for (const r of routines) this.renderTodoRow(rlist, r, 0);
    }

    // 通常TODO
    body.createDiv({ text: "TODO", cls: "ts-section-title" });
    const list = body.createDiv("ts-list");
    const items = store.ordered(this.showDone);
    if (items.length === 0) list.createDiv({ text: "TODOがありません", cls: "ts-empty" });
    for (const { todo, depth } of items) this.renderTodoRow(list, todo, depth);
  }

  private renderTodoRow(list: HTMLElement, todo: Todo, depth: number) {
    const store = this.store;
    const today = toDateStr(new Date());
    const row = list.createDiv("ts-list-row");
    if (depth) row.addClass("is-sub");
    // ルーティンのチェックは「今日の分」
    this.checkbox(row, todo, today);

    if (this.editingId === todo.id) {
      const edit = row.createEl("input", { type: "text", cls: "ts-edit-input" });
      edit.value = todo.title;
      const finish = (save: boolean) => {
        if (this.editingId !== todo.id) return;
        this.editingId = null;
        if (save) store.renameTodo(todo.id, edit.value);
        this.render();
      };
      edit.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) finish(true);
        if (e.key === "Escape") finish(false);
      });
      edit.addEventListener("blur", () => finish(true));
      window.setTimeout(() => edit.focus(), 0);
    } else {
      const isDone = store.isDone(todo, today);
      const title = row.createDiv({ text: todo.title, cls: "ts-title ts-grow" + (isDone ? " is-done" : "") });
      title.addEventListener("click", () => this.openDetail(todo, today));
      if (todo.memo.trim()) setIcon(row.createSpan("ts-memo-mark"), "sticky-note");
    }

    const n = store.scheduledCount(todo.id);
    if (n > 0) row.createSpan({ text: `予定 ${n}`, cls: "ts-lozenge ts-lozenge-progress" });
    if (todo.isRoutine) this.routineLozenge(row);
    this.lozenge(row, store.isDone(todo, today));

    const actions = row.createDiv("ts-actions");
    if (depth === 0 && !todo.isRoutine)
      this.iconButton(actions, "list-plus", "サブタスクを追加", () => {
        this.addingSubOf = this.addingSubOf === todo.id ? null : todo.id;
        this.refocus = ".ts-sub-input";
        this.render();
      });
    this.iconButton(actions, "file-text", "詳細・メモ", () => this.openDetail(todo, today));
    this.iconButton(actions, "pencil", "名前を編集", () => {
      this.editingId = todo.id;
      this.render();
    });
    this.iconButton(
      actions,
      "trash-2",
      "削除",
      () => {
        const subs = store.data.todos.filter((x) => x.parentId === todo.id).length;
        const msg =
          `「${todo.title}」を削除します。` + (subs ? `サブタスク${subs}件も削除され、` : "") + "スケジュールの割り当ても解除されます。";
        new ConfirmModal(this.app, msg, () => store.deleteTodo(todo.id)).open();
      },
      "ts-danger"
    );

    if (this.addingSubOf === todo.id) {
      const subForm = list.createDiv("ts-list-row is-sub ts-sub-form");
      const si = subForm.createEl("input", { type: "text", cls: "ts-sub-input ts-grow", placeholder: "サブタスク名" });
      const add = () => {
        if (store.addTodo(si.value, todo.id)) this.refocus = ".ts-sub-input";
      };
      si.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) add();
        if (e.key === "Escape") {
          this.addingSubOf = null;
          this.render();
        }
      });
      subForm.createEl("button", { text: "追加", cls: "ts-btn-primary" }).addEventListener("click", add);
    }
  }

  // ================= 日記 =================
  private renderDiary(body: HTMLElement) {
    const store = this.store;
    const today = toDateStr(new Date());
    this.renderDateHead(body, this.date === today ? "今日の日記" : "日記");

    const grid = body.createDiv("ts-grid");
    const main = grid.createDiv("ts-diary-main");

    const panel = main.createDiv("ts-panel");
    panel.createDiv({ text: "日記", cls: "ts-panel-title" });
    const ta = panel.createEl("textarea", {
      cls: "ts-diary-edit",
      attr: { placeholder: "今日の出来事・気づき・気分など、自由に書いてください" },
    });
    ta.value = store.data.diaries[this.date] ?? "";
    ta.addEventListener("input", () => store.setDiary(this.date, ta.value));
    ta.addEventListener("blur", () => void store.flushExports());

    const foot = panel.createDiv("ts-diary-foot");
    foot.createDiv({ text: `書き出し先: ${diaryPath(store, this.date)}`, cls: "ts-muted ts-path" });
    foot.createEl("button", { text: "今すぐMarkdownに書き出し", cls: "ts-btn" }).addEventListener("click", async () => {
      if (!store.data.diaries[this.date]) {
        new Notice("日記が空です");
        return;
      }
      await exportDiary(this.app, store, this.date);
      new Notice("Markdownに書き出しました");
    });

    // この日のタスク(日記に併記される内容)
    const tasks = main.createDiv("ts-panel");
    tasks.createDiv({ text: "この日のタスク(書き出しに含まれます)", cls: "ts-panel-title" });
    const entries = store.entriesOn(this.date).sort((a, b) => a.hour - b.hour);
    if (entries.length === 0) tasks.createDiv({ text: "スケジュールされたタスクはありません", cls: "ts-muted" });
    for (const e of entries) {
      const todo = store.getTodo(e.todoId)!;
      const done = store.isDone(todo, this.date);
      const r = tasks.createDiv("ts-diary-task");
      r.createSpan({ text: `${pad(e.hour)}:00`, cls: "ts-diary-time" });
      r.createSpan({ text: todo.title, cls: "ts-title" + (done ? " is-done" : "") });
      if (todo.isRoutine) this.routineLozenge(r);
      this.lozenge(r, done);
    }

    // 最近の日記
    const side = grid.createDiv("ts-side");
    const recent = side.createDiv("ts-panel");
    recent.createDiv({ text: "最近の日記", cls: "ts-panel-title" });
    const dates = Object.keys(store.data.diaries).sort().reverse().slice(0, 14);
    if (dates.length === 0) recent.createDiv({ text: "まだありません", cls: "ts-muted" });
    for (const d of dates) {
      const item = recent.createDiv("ts-recent" + (d === this.date ? " is-active" : ""));
      item.createDiv({ text: d, cls: "ts-recent-date" });
      const text = store.data.diaries[d].replace(/\s+/g, " ");
      item.createDiv({ text: text.length > 40 ? text.slice(0, 40) + "…" : text, cls: "ts-muted ts-recent-text" });
      item.addEventListener("click", () => {
        this.date = d;
        this.render();
      });
    }
  }
}
