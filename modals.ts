import { App, Modal, Setting } from "obsidian";
import { Store } from "./store";
import { Todo } from "./types";
import { pad } from "./util";

export class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private onOk: () => void) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText("確認");
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("キャンセル").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("削除")
          .setWarning()
          .onClick(() => {
            this.close();
            this.onOk();
          })
      );
  }
  onClose() {
    this.contentEl.empty();
  }
}

/** タスク(チケット)の詳細: タイトル・メモ・ルーティン設定 */
export class TodoDetailModal extends Modal {
  constructor(app: App, private store: Store, private todoId: string, private date: string) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass("ts-modal", "ts-detail");
    this.render();
  }

  onClose() {
    this.contentEl.empty();
    void this.store.flush();
  }

  private render() {
    const store = this.store;
    const todo = store.getTodo(this.todoId);
    const el = this.contentEl;
    el.empty();
    if (!todo) {
      this.close();
      return;
    }
    this.titleEl.setText(todo.parentId ? "サブタスクの詳細" : "タスクの詳細");

    const parent = todo.parentId ? store.getTodo(todo.parentId) : null;
    if (parent) el.createDiv({ text: `親タスク: ${parent.title}`, cls: "ts-parent-tag" });

    // タイトル
    const title = el.createEl("input", { type: "text", cls: "ts-detail-title" });
    title.value = todo.title;
    const saveTitle = () => {
      const v = title.value.trim();
      if (v && v !== todo.title) store.renameTodo(todo.id, v);
      else title.value = todo.title;
    };
    title.addEventListener("blur", saveTitle);
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) title.blur();
    });

    // ステータス
    const meta = el.createDiv("ts-detail-meta");
    const done = store.isDone(todo, this.date);
    const doneLabel = meta.createEl("label", { cls: "ts-check-label" });
    const cb = doneLabel.createEl("input", { type: "checkbox" });
    cb.checked = done;
    doneLabel.appendText(todo.isRoutine ? `${this.date} の分を完了にする` : "完了");
    cb.addEventListener("change", () => store.toggleTodo(todo.id, this.date));

    if (!todo.parentId) {
      const routineLabel = meta.createEl("label", { cls: "ts-check-label" });
      const rb = routineLabel.createEl("input", { type: "checkbox" });
      rb.checked = todo.isRoutine;
      const can = todo.isRoutine || store.canBeRoutine(todo.id);
      rb.disabled = !can;
      routineLabel.appendText("ルーティン(毎日選べる・日ごとに完了)");
      if (!can) routineLabel.setAttr("title", "サブタスクを持つTODOはルーティンにできません");
      rb.addEventListener("change", () => {
        store.setRoutine(todo.id, rb.checked);
        this.render();
      });
    }

    // メモ
    el.createDiv({ text: "メモ", cls: "ts-panel-title" });
    const memo = el.createEl("textarea", { cls: "ts-detail-memo", attr: { placeholder: "詳細・URL・メモなど" } });
    memo.value = todo.memo;
    memo.addEventListener("input", () => store.setMemo(todo.id, memo.value));

    // 予定
    const entries = store.entriesOf(todo.id);
    el.createDiv({ text: `予定 (${entries.length})`, cls: "ts-panel-title" });
    if (entries.length === 0) el.createDiv({ text: "スケジュール未割り当て", cls: "ts-muted" });
    else {
      const ul = el.createEl("ul", { cls: "ts-detail-entries" });
      for (const e of entries.slice(-10)) ul.createEl("li", { text: `${e.date}  ${pad(e.hour)}:00` });
    }

    el.createDiv({ text: `作成: ${todo.createdAt.slice(0, 10)}`, cls: "ts-muted ts-detail-created" });
  }
}

/** スロットへ割り当てるTODOをプールから複数選択するモーダル */
export class SelectTodoModal extends Modal {
  private selected = new Set<string>();
  private query = "";
  private showDone = false;

  constructor(app: App, private store: Store, private date: string, private hour: number) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass("ts-modal");
    this.titleEl.setText(`${this.date}  ${pad(this.hour)}:00 に割り当て`);
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const el = this.contentEl;
    el.empty();

    // 新規TODOのショートカット
    const create = el.createDiv("ts-modal-create");
    const newInput = create.createEl("input", { type: "text", placeholder: "新しいTODOを作成して選択…" });
    const doCreate = () => {
      const t = this.store.addTodo(newInput.value);
      if (t) {
        this.selected.add(t.id);
        this.render();
      }
    };
    newInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) doCreate();
    });
    create.createEl("button", { text: "作成" }).addEventListener("click", doCreate);

    // 検索・フィルタ
    const bar = el.createDiv("ts-modal-bar");
    const search = bar.createEl("input", { type: "search", placeholder: "検索" });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList(list);
    });
    const lbl = bar.createEl("label", { cls: "ts-check-label" });
    const cb = lbl.createEl("input", { type: "checkbox" });
    cb.checked = this.showDone;
    lbl.appendText("完了済みも表示");
    cb.addEventListener("change", () => {
      this.showDone = cb.checked;
      this.renderList(list);
    });

    const list = el.createDiv("ts-modal-list");
    this.renderList(list);

    const footer = el.createDiv("ts-modal-footer");
    footer.createEl("button", { text: "キャンセル" }).addEventListener("click", () => this.close());
    const ok = footer.createEl("button", { text: `割り当て (${this.selected.size})`, cls: "mod-cta" });
    ok.disabled = this.selected.size === 0;
    ok.addEventListener("click", () => {
      this.store.assign(this.date, this.hour, [...this.selected]);
      this.close();
    });
  }

  private renderList(list: HTMLElement) {
    list.empty();
    const q = this.query.trim().toLowerCase();
    const assigned = new Set(this.store.entriesAt(this.date, this.hour).map((e) => e.todoId));
    let count = 0;

    const addRow = (todo: Todo, depth: number) => {
      if (q && !todo.title.toLowerCase().includes(q)) return;
      count++;
      const row = list.createEl("label", { cls: "ts-modal-row" });
      if (depth) row.addClass("is-sub");
      const box = row.createEl("input", { type: "checkbox" });
      const already = assigned.has(todo.id);
      box.checked = already || this.selected.has(todo.id);
      box.disabled = already;
      box.addEventListener("change", () => {
        if (box.checked) this.selected.add(todo.id);
        else this.selected.delete(todo.id);
        this.updateFooter();
      });
      const isDone = this.store.isDone(todo, this.date);
      row.createSpan({ text: todo.title, cls: isDone ? "ts-title is-done" : "ts-title" });
      const parent = todo.parentId ? this.store.getTodo(todo.parentId) : null;
      if (parent) row.createSpan({ text: parent.title, cls: "ts-parent-tag" });
      if (todo.isRoutine) row.createSpan({ text: "ルーティン", cls: "ts-lozenge ts-lozenge-routine" });
      if (already) row.createSpan({ text: "割当済み", cls: "ts-lozenge ts-lozenge-progress" });
    };

    // ルーティンは完了済みでも常に選べる
    for (const r of this.store.routines()) addRow(r, 0);
    for (const { todo, depth } of this.store.ordered(this.showDone)) addRow(todo, depth);
    if (count === 0) list.createDiv({ text: "該当するTODOがありません", cls: "ts-empty" });
  }

  private updateFooter() {
    const ok = this.contentEl.querySelector<HTMLButtonElement>(".ts-modal-footer .mod-cta");
    if (!ok) return;
    ok.setText(`割り当て (${this.selected.size})`);
    ok.disabled = this.selected.size === 0;
  }
}
