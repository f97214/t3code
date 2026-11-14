## Context

- 前一個 change `add-zh-tw-i18n-overlay` 在建置時把介面英文字串改寫成 `__t("…")` 等查詢（`packages/client-runtime/src/i18nOverlay/transform.ts`），執行期依目前語系查 `dictionaries/zh-TW.json`（3,865 筆）。語系切換時，web 的 `I18nProvider` 與 mobile 的 `OverlayLocaleRoot` 以語系為 key 重新掛載整個介面。
- 該 change 刻意不改模組層的物件與常數：它們在 import 時就求值。web 的 `main.tsx` 是先 import 全部模組、再 `await whenLocaleReady()` 才設定語系，所以當下查到的一定是英文；切換語系也不會重新求值。
- 改寫規則只認字串字面值與 template literal，所以 `title={busy ? "Saving…" : "Save"}` 這類三元／邏輯運算式的字串分支也沒翻。
- 實測（以 `vite-plus` 的 oxc `parseSync` 掃描 `apps/web/src`、`apps/mobile/src` 非測試的 `.ts`／`.tsx`，並比對現有 zh-TW 字典；掃描腳本放在 repo 外）：

  | 類別                                                                                                                                              | 出現處 | 不重複字串 | 已在字典 | 檔案數 |
  | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------- | ------ |
  | 既有顯示位置裡的三元／邏輯運算式字串分支                                                                                                          | 2,264  | 1,674      | 284      | 404    |
  | 模組層物件的顯示屬性（`label`、`title`、`description`、`placeholder`、`hint`、`detail`、`detailLabel`、`accessibilityLabel`，只計大寫開頭的字串） | 707    | 606        | 214      | 87     |
  | 模組層字串常數（只計含空格的字串）                                                                                                                | 35     | 35         | 5        | 27     |
  - 三元分支依位置：JSX 子節點 1,275 處、夾在句子中 66 處、可見屬性 625 處、toast 120 處、對話框 84 處、選單 `label` 76 處、可執行項目 18 處；web 1,744 處、mobile 520 處；檔名含 settings 的檔案占 848 處。
  - 設定頁：`apps/web/src/components/settings/settingsSearch.ts` 的 `SETTINGS_SEARCH_ITEMS` 有 150 個列標題，經 `searchableSetting(id)` 在 175 處（grep 實測）展開成 `SettingsRow` 的 `title`。150 個中有 97 個字典裡已有翻譯，只是因為從模組常數讀取而顯示英文。各分頁「標題數／字典沒有的數」：appearance 18/8、threads 17/6、voice 15/2、browser 12/2、source-control 10/5、maintenance 8/2、access 8/5、labs 7/1、chat 7/0、about 7/4、worktrees 6/2、diffs 6/0、providers 5/3、snap-shot 5/5、connections 5/2、devices 4/3，其餘分頁各 1–2 個。
  - 以上是原始碼的靜態計數，不是畫面上同時出現的字串數：條件分支與依環境顯示的項目不會全部出現。畫面上的結果以 Implementation Contract 的截圖驗收確認。

- 已知的資料流風險（讀原始碼確認）：
  - `apps/web/src/components/settings/customModelEditor.logic.ts` 的 `DESCRIPTOR_PRESETS_BY_KIND` 與 `EFFORT_CHOICES`：`label` 會被複製進編輯器狀態，最後存進自訂模型設定。若翻譯，中文會寫進 server 設定。
  - `apps/web/src/proposedPlan.ts` 的 `PLAN_IMPLEMENTATION_PROMPT_PREFIX` 是送給 agent 的提示；`apps/mobile/src/features/diagnostics/crash-log-model.ts` 的 `FATAL_PREFIX` 等常數用來解析 crash log。這些都不能翻。
  - `apps/web/src/components/RightPanelTabs.tsx` 的分頁 `label` 有以 `"Browser"` 比對的程式；前一個 change 已讓 `Browser` 在字典中對應到自己。
- 限制：這是個人 fork，要能經常同步上游，所以不改上游檔案；也不能把中文寫進資料。

## Goals / Non-Goals

**Goals:**

- 設定頁各分頁的列標題、聊天輸入框的預設提示、預設的批准按鈕等模組層字串，在「中文（繁體）」下顯示中文，切回 English 時還原。
- 既有顯示位置裡的三元／邏輯運算式字串分支也能翻譯。
- 不修改任何上游檔案；改動都在 fork 自有的 overlay 檔案。
- 不把中文寫進資料，也不破壞以英文比對字串的程式。
- 同步上游後，用指令就能找出需要審核的新檔案與還沒翻的字串。

**Non-Goals:**

- 不翻函式回傳的字串（例如 `commandLabel(command)`、`threadTitleRegenerationToast()` 這類在函式內組好再回傳的文字），也不翻先存進區域變數再渲染的三元運算式。這兩類需要追蹤資料流，另案評估。
- 不翻直接放在 JSX 子節點的 template literal。
- 不翻模組層物件中、在 import 時就被複製出去的值（例如模組層的展開或 `map`），這些維持英文。
- 不在執行期對任意運算式查字典（理由見 Decisions）。
- 不新增 zh-TW 以外語系的字典，不提交回上游。

## Decisions

### 三元與邏輯運算式只在既有顯示位置改寫字串分支

在前一個 change 已認定為顯示文字的每個位置（JSX 子節點的運算式、可見屬性、toast／對話框參數、函式內的 `label`、可執行項目的 `title`／`description`），以及本 change 新增的模組層 getter 與常數，若值是條件運算式或邏輯運算式，就遞迴改寫它的字串分支：條件運算式的兩個分支、`&&`／`||`／`??` 的右側。條件本身與左側運算元不動，括號會被穿過。

- 這些位置本來就只用來顯示，所以不會新增寫進資料的風險；被程式比對的字串沿用「在字典中對應到自己」的處理方式。
- 若運算式夾在一句 JSX 文字中（`Status: {ok ? "Ready" : "Failed"}`），它仍是句子訊息的佔位值，分支在佔位值內各自翻譯。
- 像 `"s"` 這種複數字尾也會被收集；翻譯時讓它對應到自己，句子訊息的翻譯可以省略那個佔位。
- 不選「也改寫區域變數的初始值」：變數可能流向資料或比對，無法只靠位置判斷。

### 模組層字串改成讀取時才查字典，且只套用在已審核的檔案

**Supersedes**: add-zh-tw-i18n-overlay / 選單項目的 `label` 屬性在函式內才改寫

比較過的做法：

| 做法                                                                                                    | 上游檔案改動                                                                                                           | 中文寫進資料的風險                                                                                                                                    | 結果                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 在渲染端查詢：手改 `SettingsRow`、`ComposerPendingApprovalActions` 等讀取常數的元件，在顯示處包 `__t()` | 每個讀取端都要改；87 個來源檔的讀取端估計超過一百處（未實測，可用 `module-candidates` 列出的檔案逐一 grep 匯入端確認） | 低，只在顯示處查；但會一併翻到剛好等於字典 key 的執行期資料，例如 provider 提供的批准選項                                                             | 不選：違反「不改上游檔案」，同步時持續衝突 |
| 改寫器在所有顯示位置自動包執行期查詢（`{expr}` 改成 `{__tv(expr)}`）                                    | 無                                                                                                                     | 不寫入資料，但會把使用者內容（例如名為「Settings」的對話標題、檔名）翻掉，違反前一個 change「使用者內容維持原樣」的約定；`missing` 也收集不到這些 key | 不選                                       |
| 模組層字串改成延遲求值，套用到所有檔案                                                                  | 無                                                                                                                     | 高：已知 `customModelEditor.logic.ts` 的預設 label 會被存進設定                                                                                       | 不選                                       |
| 模組層字串改成延遲求值，只套用到已審核檔案清單                                                          | 無                                                                                                                     | 由審核把關；清單外檔案維持英文                                                                                                                        | 採用                                       |

採用的方式有兩種改寫，都只在清單內的檔案發生：

- **模組層物件屬性改成 getter**：`title: "Theme"` 改寫成 `get title() { return __t("Theme"); }`。每次讀取都依目前語系查詢，物件本身與其他屬性不變，`Map`、`find` 等保留物件參照的用法都能拿到正確語系。屬性名稱限 `label`、`title`、`description`、`placeholder`、`hint`、`detail`、`detailLabel`、`accessibilityLabel`；值必須是字串、template literal，或分支是字串的條件／邏輯運算式。
- **模組層字串常數改成可重新指派的綁定**：`const X = "…";` 改寫成 `let X; __tb(() => { X = __t("…"); });`。`__tb` 註冊後立刻執行一次，之後每當目前生效的字典改變就再執行。ES module 的 live binding 讓 import 它的檔案讀到新值。只處理單一宣告子、初始值是字串、template literal 或字串分支條件運算式的 `const`（含 `export const`）。

清單以檔案為單位，而不是以變數為單位：同一個檔案裡的模組層顯示字串通常有同樣的用途，審核一次即可；變數層級的清單在上游改名時更容易失效。

### 已審核檔案清單放在 fork 自有的 JSON，由呼叫端傳入改寫函式

清單檔 `packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json` 的格式是 `{ "include": [路徑…], "exclude": { "路徑": "原因" } }`，路徑相對於 repo 根目錄。`exclude` 記錄審核後決定不套用的檔案與原因，讓 `module-candidates` 報告可以歸零。這與前一個 change「刻意保留英文的字串在字典裡對應到自己」是同樣的思路：報告不為空，就代表有新檔案要審核。

`transform.ts` 不能有執行期 import（Node type-stripping 與 Metro 都直接載入它），所以清單由呼叫端讀取後以選項傳入：`transformSource(code, filename, parseSync, { moduleScopeFiles })`。比對時把檔名轉成 `/` 分隔，等於清單路徑或以 `/` 加清單路徑結尾就算命中，web 的絕對路徑、mobile 的絕對路徑與維護腳本的相對路徑都能比對。mobile transformer 的 cache key 要納入清單檔內容，否則改清單後 Metro 仍用舊的轉換結果。

### 新增 `module-candidates` 子指令找出待審核的檔案

`node scripts/i18n-overlay.ts module-candidates` 對每個檔案各跑一次「不含模組層規則」與「含模組層規則」的 `collectMessages`，多出來的訊息就是模組層候選字串。輸出不在 `include`／`exclude` 的候選檔案（附候選字串數與前幾個字串），以及清單中已不存在的路徑。`missing`、`stale` 改用同一份清單，讓清單內檔案的模組層字串計入。

## Implementation Contract

**使用者看到的行為**

- 語言是「中文（繁體）」時：
  - 設定頁各分頁的列標題（來自 `SETTINGS_SEARCH_ITEMS`）顯示中文，命令面板的設定項目也一樣。
  - 聊天輸入框沒有建議時，顯示中文的預設提示。
  - 預設的批准按鈕（Cancel、Decline、Always allow this session、Approve）顯示中文；provider 自己提供的批准選項維持原文。
  - 既有顯示位置裡的三元運算式，兩個分支都顯示中文。
- 切回 English 時以上全部還原；字典沒有的字串維持英文。
- 清單外的檔案、函式回傳的字串、區域變數裡的三元運算式維持英文。
- 不會有中文被存進設定、送給 agent 或寫進資料庫。

**介面**

- `transformSource(code, filename, parseSync, options?)`、`collectMessages(code, filename, parseSync, options?)`：`options` 是 `{ moduleScopeFiles?: readonly string[] }`，省略時行為與前一個 change 相同（只多了條件分支規則）。
- 執行期新增 `__tb(assign: () => void): void`。`assign` 註冊後立即執行一次；`setOverlayLocale` 或 `registerOverlayDictionary` 造成目前生效的字典改變時，依註冊順序再執行全部 `assign`；字典沒變時不執行。
- 改寫後的形式（給 code review 參考）：
  - 條件分支：`cond ? __t("A") : __t("B")`、`a && __t("A")`、`a ?? __ts("A {0}", [x])`
  - 模組層物件屬性：`get title() { return __t("Theme"); }`
  - 模組層字串常數：`let X; __tb(() => { X = __t("…"); });`（`export const` 改成 `export let`）
- 清單檔 `moduleScopeFiles.json`：`{ "include": string[], "exclude": Record<string, string> }`。
- 維護指令 `node scripts/i18n-overlay.ts module-candidates`：輸出 `{ "unlisted": [{ "file", "count", "samples" }], "missingListed": [路徑…] }` 的 JSON 到 stdout，exit 0，不寫檔。
- 改寫仍不增減行數。

**失敗模式**

- 清單檔讀不到或格式錯誤時，呼叫端視為空清單，並在 dev 模式印一行 warn（只含清單檔路徑）；模組層規則不套用，其他規則照常。
- `module-candidates` 遇到解析失敗的檔案時略過該檔，不中斷。

**驗收方式**

- `packages/client-runtime/src/i18nOverlay/transform.test.ts`：spec 中本 change 新增或修改的每個 Example 表格都有對應測試。
- `packages/client-runtime/src/i18nOverlay/runtime.test.ts`：`__tb` 立即執行、字典改變時重跑、字典沒變時不重跑。
- `scripts/i18n-overlay.test.ts`：`module-candidates` 對暫存目錄中的範例檔案，列出未列入清單的候選檔與清單中不存在的路徑。
- `vp run check:changed` 全部通過。
- `node scripts/i18n-overlay.ts missing --locale zh-TW` 與 `node scripts/i18n-overlay.ts module-candidates` 的結果都是零筆。
- 用獨立的 `--home-dir` 啟動 dev server，在 web 上以 zh-TW 截圖：外觀、對話、語音、瀏覽器、版本控制各分頁的列標題，聊天輸入框的預設提示，以及一個含三元運算式的按鈕；切回 English 再截一次，確認還原。
- 審核後會寫進資料的檔案（至少 `customModelEditor.logic.ts`）列在 `exclude`；在 zh-TW 下新增一個自訂模型預設欄位並存檔，確認設定裡存的是英文。
- mobile：`vp exec expo export --platform android` 成功，且 bundle 中被改寫的常數在 import 端是透過 `exports` 讀取（檢查 bundle 內容確認）；無法在裝置上驗證時明確標示「未在裝置上驗證」。

**範圍**

- 範圍內：上述三種改寫、`__tb`、清單檔與 `module-candidates`、web 與 mobile 呼叫端傳入清單、清單的初始審核、新增字串的 zh-TW 翻譯。
- 範圍外：Non-Goals 列出的項目、任何上游檔案的修改、gt-react 已處理的字串（例如以 `msg()` 標記的設定分頁名稱）。

## Risks / Trade-offs

- [模組層物件在 import 時就被複製（展開、`map`、`Object.fromEntries`），複本停在英文] → 只會少翻、不會錯；`missing` 無法偵測這種情況，以截圖驗收補強，審核時把看到的情況記在 PR 說明。
- [getter 只有讀取、沒有 setter，程式若對該屬性賦值，ES module 的 strict mode 會丟出 TypeError] → 審核清單檔案時確認沒有對這些屬性賦值；TypeScript 型別大多是 `readonly`，可作為輔助判斷。
- [清單內物件被 `JSON.stringify`、`structuredClone` 或存檔時，會帶出當下語系的中文] → 這正是審核要擋的情況，有這種路徑的檔案放進 `exclude`。
- [設定頁搜尋 `searchSettings` 比對 `item.title`，改成中文後，英文關鍵字只能靠 `searchTerms` 命中] → 與前一個 change 對命令面板的取捨相同；`searchTerms` 已含大多數英文關鍵字。`translate(item.title)` 傳入中文時 gt-react 的 `m()` 是否原樣回傳，要在實作時確認。
- [Metro（Babel 轉 CommonJS）對重新指派的 `export let` 是否同步更新 `exports`] → Babel 的 CommonJS 轉換會把對 export 綁定的賦值同步到 `exports`，這是已知行為，但尚未在本 repo 實測；以 mobile bundle 驗收確認。若不成立，mobile 呼叫端不傳清單，模組層規則只在 web 生效，並在 PR 說明標示。
- [上游在已列入清單的檔案新增模組層字串，且新字串會寫進資料] → 清單只審核了當時的內容；`missing` 會列出新字串，翻譯前先確認用途，必要時把該檔移到 `exclude` 或讓該 key 對應到自己。
- [新增約 1,800 個待翻字串（三元分支 1,390、模組層物件 392、常數約 25，皆為上面靜態掃描的估計，未扣除審核後排除的檔案）] → 實作規則後以 `missing` 報告的實際筆數為準，分批翻譯並沿用前一個 change 的用語表。
- [執行期成本：getter 每次讀取多一次 Map 查詢；語系切換時多跑一次全部 `__tb`] → 設定搜尋一次最多讀 150 個標題；`__tb` 的註冊數估計不超過 35 個（上表常數數），實作後以清單內檔案的實際計數確認。兩者都只是 Map 查詢，不影響畫面更新頻率。
