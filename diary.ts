import { App, TFile, normalizePath } from "obsidian";
import { Store } from "./store";
import { parseDate, pad, WEEK } from "./util";

export function diaryPath(store: Store, date: string) {
  const folder = store.data.settings.diaryFolder.trim().replace(/^\/+|\/+$/g, "");
  return normalizePath(folder ? `${folder}/${date}.md` : `${date}.md`);
}

/** AI分析しやすいよう、frontmatter付きで日記とその日のタスク実績をまとめる */
export function buildDiaryMarkdown(store: Store, date: string): string {
  const d = parseDate(date);
  const entries = store.entriesOn(date).sort((a, b) => a.hour - b.hour);
  const done = entries.filter((e) => store.isDone(store.getTodo(e.todoId)!, date)).length;

  const lines: string[] = [
    "---",
    `date: ${date}`,
    `weekday: ${WEEK[d.getDay()]}`,
    `tasks_scheduled: ${entries.length}`,
    `tasks_done: ${done}`,
    "tags: [diary]",
    "---",
    `# ${date}(${WEEK[d.getDay()]})の日記`,
    "",
    "## 日記",
    "",
    (store.data.diaries[date] ?? "").trim(),
    "",
    "## その日のタスク",
    "",
  ];
  if (entries.length === 0) lines.push("(なし)");
  for (const e of entries) {
    const t = store.getTodo(e.todoId)!;
    const parent = t.parentId ? store.getTodo(t.parentId) : null;
    const name = parent ? `${parent.title} > ${t.title}` : t.title;
    const routine = t.isRoutine ? " (ルーティン)" : "";
    lines.push(`- ${pad(e.hour)}:00 [${store.isDone(t, date) ? "x" : " "}] ${name}${routine}`);
    if (t.memo.trim()) {
      for (const m of t.memo.trim().split("\n")) lines.push(`  > ${m}`);
    }
  }
  return lines.join("\n") + "\n";
}

async function ensureFolder(app: App, path: string) {
  const parts = path.split("/").slice(0, -1);
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!(await app.vault.adapter.exists(cur))) await app.vault.createFolder(cur);
  }
}

export async function exportDiary(app: App, store: Store, date: string) {
  const path = diaryPath(store, date);
  const existing = app.vault.getAbstractFileByPath(path);
  const hasText = !!store.data.diaries[date]?.trim();
  if (!hasText && !existing) return; // 空の日記のファイルは作らない

  const md = buildDiaryMarkdown(store, date);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, md);
  } else {
    await ensureFolder(app, path);
    await app.vault.create(path, md);
  }
}

export async function exportAllDiaries(app: App, store: Store) {
  const dates = Object.keys(store.data.diaries);
  for (const d of dates) await exportDiary(app, store, d);
  return dates.length;
}
