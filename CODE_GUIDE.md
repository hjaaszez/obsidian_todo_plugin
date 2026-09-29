# ソースコード解説ガイド(TypeScript初心者向け)

このプラグインのコードを「どのファイルが何をしているか」「登場するTypeScript文法は何か」の順に読み解くための資料です。

---

## 1. 全体像

### ファイルの役割

| ファイル | 役割 | 一言でいうと |
|---|---|---|
| [main.ts](main.ts) | プラグインの入口 | Obsidianに「ビューを登録する」 |
| [types.ts](types.ts) | データの型定義 | TODOやスケジュールの「形」 |
| [store.ts](store.ts) | データの保持・更新・保存 | アプリの「頭脳」 |
| [view.ts](view.ts) | 画面(タブ2つ) | HTMLを組み立てて表示する |
| [modals.ts](modals.ts) | ポップアップ2種 | TODO選択・削除確認 |
| [styles.css](styles.css) | 見た目 | Jira風の配色とレイアウト |

### 依存関係

```
main.ts ──creates──▶ Store (store.ts) ──uses──▶ types.ts
   │                    ▲
   └─registers──▶ TodoScheduleView (view.ts) ──opens──▶ Modals (modals.ts)
                        │  データの読み書きは全部 Store 経由
                        └───────────────────────────────┘
```

**設計の肝は「データはStoreだけが持つ。画面(View)はStoreを見て描画するだけ」** という分担です。

### データの流れ(例: チェックボックスを押したとき)

```
チェックボックスをクリック
  → view.ts の change イベント
  → store.toggleTodo(id)      … isDone を反転
  → store.commit()
       ├─ listeners を全部呼ぶ → view.render() が走り画面が描き直される
       └─ scheduleSave()      → 300ms後に saveData() で data.json へ保存
```

---

## 2. Obsidianプラグインの基本

Obsidianが提供する部品を、自分のクラスで継承して使います。

| Obsidianのクラス | このプラグインでの使い方 |
|---|---|
| `Plugin` | `TodoSchedulePlugin`(main.ts)。`onload()` が起動時、`onunload()` が停止時に呼ばれる |
| `ItemView` | `TodoScheduleView`(view.ts)。タブとして開ける画面 |
| `Modal` | `SelectTodoModal` / `ConfirmModal`(modals.ts)。ポップアップ |

主な API:

- `this.registerView(種類名, ビューを作る関数)` … 画面の部品を登録する
- `this.addRibbonIcon(...)` / `this.addCommand(...)` … 左のアイコンとコマンドパレットに項目を追加
- `this.loadData()` / `this.saveData(obj)` … `.obsidian/plugins/todo-schedule/data.json` の読み書き
- `el.createDiv()` / `el.createEl("button", {...})` / `el.empty()` … HTML要素の生成・クリア(Obsidian独自の便利関数)
- `setIcon(要素, "アイコン名")` … Lucideアイコンを描画

---

## 3. このコードに出てくるTypeScript文法

コード中に出てくる順ではなく、頻出度の高い順に説明します。

### 3.1 型注釈 `: 型`

JavaScriptに「この変数は何型か」を書き足したものが TypeScript です。

```ts
const pad = (n: number) => String(n).padStart(2, "0");
//                ^^^^^^ 引数 n は number
private date = toDateStr(new Date());   // 右辺から string と自動で推論される(書かなくてもよい)
```

### 3.2 `interface`(オブジェクトの形の定義)

[types.ts](types.ts) より。

```ts
export interface Todo {
  id: string;
  title: string;
  isDone: boolean;
  parentId: string | null;  // string か null のどちらか(ユニオン型)
  repeatRule?: string;      // ? は「あってもなくてもよい」
  createdAt: string;
}
```

`Todo` 型の値は、この形を満たさないとコンパイルエラーになります。タイプミスや項目の付け忘れを実行前に検出してくれるのが TypeScript の最大の利点です。

### 3.3 `import` / `export`

```ts
// types.ts
export interface Todo { ... }      // 他のファイルから使えるようにする
// store.ts
import { Todo } from "./types";    // ./types.ts から取り込む
```

`export default class ...`(main.ts)は「そのファイルの主役」を1つだけ公開する書き方です。Obsidianは main.js のこのデフォルトエクスポートをプラグインとして読み込みます。

### 3.4 `class` と `extends`

```ts
export class TodoScheduleView extends ItemView { ... }
```

`extends ItemView` は「Obsidianの `ItemView` の機能を引き継いだ、自分専用のビュー」という意味です。`getViewType()` など、Obsidianが呼び出すメソッドを上書き(オーバーライド)して使います。

`this` は「このオブジェクト自身」です。

### 3.5 コンストラクタ引数の `private`(省略記法)

```ts
constructor(private plugin: Plugin) {}
```

これは次の3行を1行にした書き方です。

```ts
private plugin: Plugin;
constructor(plugin: Plugin) { this.plugin = plugin; }
```

引数に `private` などを付けると、同名のプロパティが自動で作られ、代入もされます。[store.ts](store.ts)、[view.ts](view.ts)、[modals.ts](modals.ts) で多用されています。`private` はそのクラスの中からだけ使える、という意味です。

### 3.6 アロー関数 `=>`

```ts
const toDateStr = (d: Date) => `${d.getFullYear()}-...`;
btn.addEventListener("click", () => this.render());
```

`(引数) => 処理` は関数の短い書き方です。特に重要な性質として、アロー関数の中の `this` は外側の `this` のままなので、イベントハンドラの中でも `this.render()` と書けます。

### 3.7 テンプレートリテラル

```ts
`${d.getFullYear()}年${d.getMonth() + 1}月`
```

バッククォート `` ` `` で囲み、`${式}` で値を埋め込めます。

### 3.8 `?.`(オプショナルチェーン)と `??`(null合体)

```ts
raw?.todos ?? []       // raw が null でなければ raw.todos、それが null/undefined なら []
this.store.getTodo(id)?.isDone   // getTodo が undefined を返しても落ちず、結果が undefined になる
```

### 3.9 `!`(非nullアサーション)と `as`

```ts
const todo = store.getTodo(entry.todoId)!;
```

`getTodo` は「見つからなければ `undefined`」を返すため、型は `Todo | undefined` です。末尾の `!` は「ここでは絶対に undefined ではない」とコンパイラに約束する記号です。直前の `entriesAt` が存在するTODOだけを返すのでこう書けますが、間違った約束をすると実行時に落ちます。

`as` も同様に「この型として扱う」という宣言です(`(await this.plugin.loadData()) as Partial<PluginData> | null` など)。

### 3.10 `Partial<T>`

`Partial<PluginData>` は「`PluginData` の全項目が省略可能になった型」です。保存ファイルが古い、あるいは空でも安全に読めるようにするために使っています。

### 3.11 分割代入とスプレッド構文

```ts
for (const { todo, depth } of this.store.ordered(...)) { ... }
// ↑ 配列の要素 {todo: ..., depth: ...} から todo と depth を取り出す

[...this.selected]         // Set を配列に変換
[...DEFAULT_DATA.todos]    // 配列のコピー
```

### 3.12 `async` / `await`

```ts
async load() {
  const raw = await this.plugin.loadData();  // 読み込みが終わるまで待つ
}
```

ファイルI/Oのような「時間のかかる処理」は `Promise` を返します。`await` でその完了を待ち、`await` を使う関数には `async` を付けます。

### 3.13 `Set` と配列メソッド

```ts
this.data.todos.filter((t) => t.parentId === id)   // 条件に合うものだけ残す
this.data.todos.find((t) => t.id === id)           // 最初の1件(なければ undefined)
this.data.todos.some((t) => ...)                   // 1件でも条件を満たせば true
```

`Set` は重複を許さない集合で、選択中のTODO ID(`selected`)や購読者(`listeners`)の管理に使っています。

### 3.14 ユニオン型(文字列リテラル型)

```ts
type Tab = "schedule" | "todos";
private tab: Tab = "schedule";
```

`"schedule"` か `"todos"` のどちらかしか代入できない型です。`this.tab = "todo"`(typo)と書くとエラーになります。

---

## 4. ファイル別ウォークスルー

### 4.1 [main.ts](main.ts) — 入口

```ts
export default class TodoSchedulePlugin extends Plugin {
  store!: Store;

  async onload() {
    this.store = new Store(this);
    await this.store.load();                       // data.json を読む
    this.registerView(VIEW_TYPE, (leaf) => new TodoScheduleView(leaf, this.store));
    this.addRibbonIcon(...);  this.addCommand(...);
  }
}
```

- `store!: Store;` の `!` は「`onload` の中で必ず初期化する」という約束です(3.9参照)
- `registerView` の第2引数は「ビューが必要になったときに呼ばれる工場関数」です
- `activateView()` は、すでに開いていればそれを前面に出し、なければ新しいタブで開きます

### 4.2 [store.ts](store.ts) — データ管理

Store の責務は3つです。

1. **保持**: `data`(`todos` / `scheduleEntries` / `note`)を持つ
2. **更新**: `addTodo`、`toggleTodo`、`deleteTodo`、`assign`、`unassign`、`setNote` など
3. **通知と保存**: 更新のたびに `commit()` を呼ぶ

```ts
private commit() {
  this.listeners.forEach((fn) => fn());  // 画面へ「変わったよ」と通知
  this.scheduleSave();                   // 保存を予約
}
```

読むときのポイント:

- **デバウンス保存**: `scheduleSave` は、呼ばれるたびに前のタイマーを取り消して300ms後に保存します。連続操作でも保存が1回にまとまります。
- **`onChange(fn)`**: 購読の登録です。戻り値は購読解除の関数で、view.ts で `this.register(...)` に渡すと、ビューが閉じたときに自動で解除されます。
- **`ordered(showDone)`**: 「親 → その子」の順に並べたリストを作り、`{ todo, depth }` で階層の深さも返します。画面のインデントに使います。
- **`deleteTodo`**: 子TODOと、関連する `scheduleEntries` もまとめて消します。
- **`addTodo`**: `parentId` の親自体がサブタスクだと `null` を返して拒否します。これで「サブタスクは1階層まで」を保証しています。
- **`setNote` だけ `commit()` を呼ばない**: 入力中に毎回再描画すると、テキストエリアのフォーカスが外れてしまうためです。

### 4.3 [view.ts](view.ts) — 画面

#### 状態(state)

```ts
private tab: Tab = "schedule";     // 今どちらのタブか
private date = toDateStr(...);     // 表示中の日付
private showDone = true;           // 完了済みを表示するか
private editingId: string | null = null;  // 編集中のTODO
```

画面の状態はすべてクラスのプロパティで持ちます。

#### 描画の考え方: 「全部消して作り直す」

```ts
private render() {
  this.root.empty();          // いったん全消し
  ...                         // 現在の状態から全部作り直す
}
```

Reactのような差分更新の仕組みはありません。**状態を変える → `render()` を呼ぶ** の繰り返しで、単純で分かりやすい反面、再描画でフォーカスが失われます。そのため `refocus` にCSSセレクタを入れておき、描画後にそこへフォーカスを戻しています。

#### メソッドの構成

```
render()
 ├─ tabButton()             タブボタン
 ├─ renderSchedule()        スケジュールタブ
 │    ├─ 日付操作・進捗バー
 │    ├─ 時間ごとの行 → カード(checkbox / lozenge / iconButton)
 │    └─ renderNote() → linkify()   メモとURLの自動リンク化
 └─ renderTodos()           TODOタブ(追加フォーム・一覧・サブタスク・編集・削除)
```

`checkbox()`、`lozenge()`、`iconButton()` は、複数の画面から使う小さな部品を関数にしたものです。

#### 読み方のコツ

`createDiv("ts-row")` の `"ts-row"` はCSSのクラス名です。[styles.css](styles.css) の `.ts-row { ... }` がこの要素の見た目を決めます。**HTMLを作るコードと、見た目を決めるCSSはクラス名でつながっている**と理解してください。

`linkify()` は、正規表現 `/https?:\/\/[^\s<>"']+/g` でURLを見つけ、その前後は文字、URL部分は `<a>` に変換します。

### 4.4 [modals.ts](modals.ts) — ポップアップ

- `ConfirmModal`: メッセージと「キャンセル」「削除」ボタンだけのシンプルな確認。`onOk` というコールバック(削除処理を実行する関数)を受け取ります
- `SelectTodoModal`: 選択中のIDを `Set` で持ち、検索・新規作成・割り当てを行います
  - `render()` は全体を組み立て、`renderList()` は一覧部分だけを作り直します。検索の入力中にキー入力欄のフォーカスが外れないよう分けています
  - 「割り当て」で `store.assign(date, hour, [...selected])` を呼びます。すでに同じスロットに割り当て済みのものは、チェック済み・操作不可で表示します

`onOpen()` / `onClose()` は、Obsidianが開閉時に呼ぶメソッドです。

### 4.5 [types.ts](types.ts) — 型と定数

```ts
export const HOURS = Array.from({ length: 20 }, (_, i) => i + 5);  // [5, 6, ..., 24]
```

`Array.from({length: 20}, (_, i) => i + 5)` は「長さ20の配列を作り、各要素を `i + 5` にする」書き方です。`_` は使わない引数の慣用名です。

---

## 5. データ構造(data.json)

```json
{
  "todos": [
    { "id": "abc", "title": "住所変更", "isDone": false, "parentId": null, "createdAt": "2026-09-29T..." }
  ],
  "scheduleEntries": [
    { "id": "xyz", "date": "2026-09-29", "hour": 7, "todoId": "abc" }
  ],
  "note": "https://example.com"
}
```

- スケジュールの1枠は `ScheduleEntry` で、**TODOそのものではなく `todoId` の参照**だけを持ちます
- 完了状態は `Todo.isDone` にだけあります。同じTODOを複数スロットに置いてもすべて連動するのは、この構造のためです

---

## 6. ビルドの仕組み

```
main.ts, view.ts, store.ts ...  (TypeScript)
        │  npm run build
        ├─ tsc -noEmit     型チェックだけ実行(出力なし)
        └─ esbuild         全ファイルを1つの main.js にまとめる(バンドル)
        ▼
    main.js  ← Obsidianはこれだけを読む
```

- `esbuild.config.mjs` の `external: ["obsidian", ...]` は、`obsidian` ライブラリは本体側にあるため main.js に含めない、という指定です
- `npm run dev` は、保存のたびに自動で再ビルドします(型チェックはしません)

---

## 7. 練習問題(触りながら理解する)

| 課題 | 触る場所 | ヒント |
|---|---|---|
| 完了時の色を変える | [styles.css](styles.css) | `.ts-lozenge-done` の色を変更する |
| TODOに「メモ」欄を足す | [types.ts](types.ts) → [store.ts](store.ts) → [view.ts](view.ts) | まず `Todo` に `memo?: string` を足すと、型エラーで直すべき箇所が分かる |
| 時間帯を6:00開始にする | [types.ts](types.ts) の `HOURS` | `i + 5` を変える |
| 削除時の確認を無くす | [view.ts](view.ts) の削除ボタン | `new ConfirmModal(...)` の代わりに `store.deleteTodo(todo.id)` を直接呼ぶ |
| TODO追加時にコンソール表示 | [store.ts](store.ts) の `addTodo` | `console.log(todo)` を追加し、Cmd+Option+Iで確認する |

コードを変えたら `npm run build` → `main.js` を再コピー → プラグインのオフ/オン、の順で反映します。

## 8. つまずきやすい点のメモ

- **「型エラー」は怖くない**: 赤線は、実行前に間違いを教えてくれています。エラー文の最後の1行に原因が書かれていることが多いです。
- **`undefined` が混ざる**: 配列の `find` などは「見つからない」場合があるため、`Todo | undefined` 型になります。`?.` や `if (!x) return;` で対処します。
- **画面が更新されない**: 状態を変えたあとに `render()` を呼んでいるか、Storeを更新したあとは `commit()` を経由しているかを確認します。

---

## 9. 追加機能の解説(ルーティン・詳細メモ・日記)

### 新しいファイル
| ファイル | 役割 |
|---|---|
| [util.ts](util.ts) | 日付ヘルパー(`toDateStr` / `parseDate` / `pad` / `WEEK`)。view.ts と diary.ts で共有 |
| [diary.ts](diary.ts) | 日記をMarkdown文字列にして、Vaultへファイル書き出しする |

### ルーティン
- `Todo` に `isRoutine: boolean` と `doneDates: string[]`(完了した日の一覧)を追加
- 通常TODOの完了は `isDone` の1つだけ。ルーティンは「その日が `doneDates` に入っているか」で判定する
- この差を吸収するのが `store.isDone(todo, date)`。画面側は常にこの関数で完了判定する
- `toggleTodo(id, date)` は、ルーティンなら `doneDates` に日付を出し入れし、通常TODOなら `isDone` を反転する
- 古い `data.json`(新項目なし)は、`store.load()` の `??` で既定値を補って読む

### タスク詳細とメモ
- `Todo.memo` に本文を保存。`TodoDetailModal`(modals.ts)で編集する
- 入力中に画面全体を再描画しないよう、`setMemo` は `commit()` を呼ばない(`setNote` と同じ考え方)
- 詳細は、スケジュールのカードをクリックするか、TODOタブのタイトルをクリックすると開く。名前の変更は鉛筆アイコン

### 日記
- `PluginData.diaries: Record<string, string>` は「日付 → 本文」の連想配列(`Record<K, V>` はキー型と値型を指定したオブジェクト型)
- 入力のたびに `setDiary()` が呼ばれ、次の2つが走る:
  1. `data.json` への保存(300msデバウンス)
  2. Markdown書き出しの予約(1000msデバウンス)。連打しても書き出しは1回にまとまる
- 書き出しは `store.exporter`(関数)を呼ぶ形。実体は main.ts で `exportDiary` を設定している。Store が Obsidian のファイル API を直接知らなくて済む、依存の逆転という考え方
- 出力先は `<設定のフォルダ>/YYYY-MM-DD.md`。frontmatter(日付・曜日・タスク数)+日記本文+その日のタスク実績・メモを含む
- 書き出し先フォルダは、設定 → TODO Schedule で変更できる
