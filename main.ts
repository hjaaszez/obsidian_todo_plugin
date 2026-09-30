import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { exportAllDiaries, exportDiary } from "./diary";
import { Store } from "./store";
import { TodoScheduleView, VIEW_TYPE } from "./view";

export default class TodoSchedulePlugin extends Plugin {
  store!: Store;

  async onload() {
    this.store = new Store(this);
    await this.store.load();
    this.store.exporter = async (date) => {
      try {
        await exportDiary(this.app, this.store, date);
      } catch (e) {
        console.error(e);
        new Notice("日記のMarkdown書き出しに失敗しました");
      }
    };

    this.registerView(VIEW_TYPE, (leaf) => new TodoScheduleView(leaf, this.store));

    this.addRibbonIcon("calendar-check", "TODO Scheduleを開く", () => this.activateView());
    this.addCommand({
      id: "open-view",
      name: "TODO Scheduleを開く",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "export-all-diaries",
      name: "日記を全件Markdownに書き出す",
      callback: async () => {
        const n = await exportAllDiaries(this.app, this.store);
        new Notice(`日記を${n}件書き出しました`);
      },
    });
    this.addSettingTab(new TodoScheduleSettingTab(this.app, this));

    // 他端末の変更(iCloud等)を取り込むきっかけ: アプリ復帰時 / 定期 / 起動直後
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") void this.store.syncFromDisk();
    });
    this.registerInterval(window.setInterval(() => void this.store.syncFromDisk(), 60_000));
    this.app.workspace.onLayoutReady(() => void this.store.syncFromDisk());
  }

  /** Obsidianが「data.jsonが外部(同期)で更新された」と検知したとき */
  onExternalSettingsChange() {
    void this.store.syncFromDisk();
  }

  async onunload() {
    await this.store.flush();
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}

class TodoScheduleSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TodoSchedulePlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("日記の書き出し先フォルダ")
      .setDesc("日記は「<フォルダ>/YYYY-MM-DD.md」として、日付ごとに書き出されます(Vault内の相対パス)")
      .addText((t) =>
        t
          .setPlaceholder("TODO Schedule/Diary")
          .setValue(this.plugin.store.data.settings.diaryFolder)
          .onChange((v) => this.plugin.store.setDiaryFolder(v))
      );
  }
}
