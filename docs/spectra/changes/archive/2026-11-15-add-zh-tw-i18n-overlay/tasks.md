## 1. 改寫函式（TDD）

測試共通事項：

- 所有改寫函式的測試都在 `packages/client-runtime/src/i18nOverlay/transform.test.ts`，以 `vp test run src/i18nOverlay/transform.test.ts`（在 `packages/client-runtime` 執行）跑。
- 輸入是字串、輸出也是字串，解析器使用真的 `vite-plus` `parseSync`，沒有檔案系統、網路或時間相依。
- 實作依「編譯期改寫，不逐檔包 `<T>`，也不在執行期替換 DOM」，以及「用 Vite+ 內建的 oxc parseSync 與字串拼接，不新增相依」：`transformSource` 由呼叫端傳入 `parseSync`。

- [x] 1.1 實作 Build-time rewrite of JSX text：純 JSX 文字改寫成 `__t("<收斂空白後的英文>")`，保留 JSX 會渲染的前後空白，沒有拉丁字母的文字不改，改寫後行數不變。
  - 先寫失敗的測試，再實作。
  - 驗證：`transform.test.ts` 的 `describe("Build-time rewrite of JSX text")` 涵蓋 spec 範例表三列，以及「line count is preserved」案例，全部通過。
- [x] 1.2 實作 Mixed text and expressions form one message，遵循「三種執行期查詢與帶 key 的 Fragment 佔位值」。[after: 1.1]
  - 文字與運算式或子元素相連時，合成一句 `{0}`、`{1}` 佔位訊息，改寫成 `__tx(訊息, [值…])`。
  - 每個值包成 `<__I18nFragment key="i18n-N">…</__I18nFragment>`，並且只注入一次 `import { Fragment as __I18nFragment } from "react"`。
  - 子元素內的文字另外翻譯。
  - 驗證：`describe("Mixed text and expressions form one message")` 涵蓋 spec 範例表三列，以及「injects the Fragment import once」案例，全部通過。
- [x] 1.3 實作 Visible attributes are rewritten。[after: 1.1]
  - 允許清單內屬性（`title`、`placeholder`、`aria-label`、`aria-description`、`alt`、`label`、`description`、`tooltip`）的字串值改寫成 `__t(...)`；template literal 改寫成 `__ts("… {0} …", [expr])`。
  - 清單外的屬性一律不改。
  - 驗證：`describe("Visible attributes are rewritten")` 涵蓋 spec 範例表四列，全部通過。
- [x] 1.4 實作 Notification and confirmation call arguments are rewritten，遵循「toast 與確認對話框參數採白名單」。[after: 1.3]
  - 只改 `toastManager.add` 物件參數的 `title`、`description`；`requestConfirmDialog` 的第一個參數；`Dialog.confirm`／`Dialog.prompt` 物件參數的 `title`、`message`、`confirmText`、`cancelText`；`Dialog.alert` 的前兩個參數。
  - 驗證：`describe("Notification and confirmation call arguments are rewritten")` 的「toast title is translated at call time」、「data objects are not translated（`createThread({ title: "New thread" })`）」，以及 spec「dialog call rewrites」範例表三列，全部通過。
- [x] 1.5 實作 Exclusions，並提供 `collectMessages`，與 `transformSource` 共用同一套規則。[after: 1.2, 1.4]
  - 不改的地方：`<T>` 內部、`code`／`pre`／`kbd`、測試檔、`node_modules`。
  - 沒有可改寫內容的檔案回傳 `null`，不注入 import；解析失敗也回傳 `null`。
  - 驗證：`describe("Exclusions")` 涵蓋「upstream-translated content is left alone」「file without UI strings returns null」「parse failure returns null」三個案例；`describe("collectMessages")` 確認回傳的 key 與行號，跟 1.1–1.4 會改寫的字串一致。

## 2. 執行期

- [x] 2.1 實作 Runtime lookup with source fallback 與 Placeholder substitution：`__t`、`__ts`、`__tx`、`setOverlayLocale`、`registerOverlayDictionary`、`loadOverlayDictionary`。
  - 依「翻譯模組放在 `packages/client-runtime` 的子路徑」，在 `packages/client-runtime/package.json` 加上 `./i18n-overlay` 與 `./i18n-overlay/transform` 兩個 export。
  - 驗證：`packages/client-runtime/src/i18nOverlay/runtime.test.ts` 的下列案例通過（純函式，沒有外部相依）：
    - 「returns the translation for the active locale」
    - 「falls back to source text when the key is missing」
    - 「returns source text for English without a dictionary」
    - 「reorders and omits placeholders」
    - 「places element values in placeholder positions」
    - 「unknown locale resolves without loading」

## 3. 用戶端接線

- [x] 3.1 web／desktop 的 Locale activation in clients，遵循「語系切換以 key 重新掛載整個介面」。[after: 1.5, 2.1]
  - 新檔 `apps/web/vite/i18nOverlay.ts` 是 `enforce: "pre"` 的 Vite 外掛，對 `apps/web/src` 下的 `.ts`、`.tsx` 呼叫 `transformSource`，並在 `apps/web/vite.config.ts` 的 `react()` 前面註冊。
  - `apps/web/src/i18n/runtime.ts` 在 `whenLocaleReady` 並行 `loadLocale` 與 `loadOverlayDictionary`，在 `activateLocale` 時 `setOverlayLocale`（最終寫法見 8.2）。
  - `apps/web/src/i18n/I18nProvider.tsx` 用以語系為 key 的 Fragment 包住 children。
  - 這個任務只有接線，沒有新邏輯，因此不新增自動化測試；邏輯由 1.x 與 2.1 的測試涵蓋。
  - 驗證：用獨立的 `--home-dir` 啟動 `vp run dev`，在內建瀏覽器確認兩件事：
    - 已存的語言是 `zh-TW` 時，重新載入後第一個畫面的側邊欄就是中文。
    - 在設定頁切回 English，全部字串還原；再切回中文（繁體），全部字串又變回中文。
- [x] 3.2 mobile 的 Locale activation in clients，遵循「mobile 以包裝 Metro transformer 的方式套用」。[after: 1.5, 2.1]
  - `apps/mobile/metro.config.js` 先讀取 Expo 預設的 `babelTransformerPath`，用 `T3CODE_I18N_OVERLAY_UPSTREAM_TRANSFORMER` 傳給新檔 `apps/mobile/i18nOverlayTransformer.js`。
  - 新檔對 `apps/mobile/src` 的檔案先跑 `transformSource`，再交給原本的 transformer。
  - `apps/mobile/src/i18n/OverlayLocaleRoot.tsx`（掛在 `App.tsx` 根部）註冊 zh-TW 字典、設定 overlay 語系，children 用以語系為 key 的 Fragment 包住（最終寫法見 8.1、8.5）。
  - 驗證：在 `apps/mobile` 執行 `vp exec expo export --platform android --output-dir <scratchpad>` 成功，產出的 bundle 含 `__t(` 呼叫。
  - 有裝置或模擬器時，以 `vp run mobile:install` 安裝後截圖確認設定頁是中文；沒有就在回報中標示「未在裝置上驗證」。
  - 結果：未在裝置上驗證（此環境沒有 T3 裝置工具）；`expo export --platform android` 成功，bundle 含改寫呼叫。

## 4. 字典維護

- [x] 4.1 實作 Dictionary maintenance command：`scripts/i18n-overlay.ts`。[after: 1.5]
  - 兩個子指令 `missing --locale <id> [--under <dir>]` 與 `stale --locale <id>`，用 `collectMessages` 掃描 `apps/web/src`、`apps/mobile/src`，輸出 JSON（missing 會附上來源檔），成功時 exit 0（參數錯誤 exit 2），不寫檔。
  - 依 `fork-guard.mjs` 的前例，把這支腳本加進 `knip.jsonc` 的 scripts entry。
  - 驗證：`scripts/i18n-overlay.test.ts` 的「missing lists keys absent from the dictionary with their files」「stale lists dictionary keys no longer in source」「--under limits the scan」三個案例通過。
    - 測試用 `NodeFS.mkdtempSync(NodeOS.tmpdir())` 建立假的 `src` 與字典，隔離檔案系統。
    - 以 `vp test run scripts/i18n-overlay.test.ts` 執行。

## 5. Complete zh-TW dictionary

用語表（每一批都要遵守）：

- 執行緒、專案、提供者、工作樹、封存、釘選、快速鍵、儲存庫、環境、連線、差異、提取要求、原始碼控制、設定、代理、終端機。
- 依「刻意保留英文的字串在字典裡對應到自己」：產品名、provider 名稱、指令、檔名保留英文，並在字典中寫成對應到自己的條目。
- 佔位 `{N}` 一個都不能少，也不能新增；英文複數用的佔位可以省略。

分批翻譯：

- 各批都由 4.1 的 `missing --under` 輸出取得字串。
- 字串會依 1.x 的規則改寫，所以每一批都要遵守「字典以英文原文當 key，不用 hash」：key 必須與 `missing` 輸出完全一致。
- 5.1–5.4 只新增各自範圍的 key，最後由 5.5 一次合併寫入 `packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json`。

- [x] 5.1 翻譯設定頁與首次使用流程：`apps/web/src/components/settings`、`apps/web/src/onboarding`、`apps/web/src/components/onboarding`。[after: 4.1]
  - 驗證：這一批的 JSON 涵蓋 `missing --under` 上述目錄列出的每一個 key，並由 5.5 的檢查確認。
- [x] 5.2 翻譯聊天、輸入框、側邊欄與執行緒畫面：`apps/web/src/components/chat`、`apps/web/src/components/sidebar`，以及 `apps/web/src/components` 中檔名以 `Chat`、`Composer`、`Sidebar`、`Thread` 開頭的檔案。[after: 4.1]
  - 驗證同 5.1。
- [x] 5.3 翻譯 web 其餘畫面：`apps/web/src` 中不屬於 5.1、5.2 的部分。[after: 4.1]
  - 驗證同 5.1。
- [x] 5.4 翻譯 mobile：`apps/mobile/src`。[after: 4.1]
  - 驗證同 5.1。
- [x] 5.5 合併 5.1–5.4 並統一用語，寫入 `packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json`。[after: 5.1, 5.2, 5.3, 5.4]
  - 驗證：
    - `node scripts/i18n-overlay.ts missing --locale zh-TW` 輸出零筆，`stale` 也輸出零筆。
    - 抽查用語表內的詞沒有出現其他譯法（例如字典值中不出現「線程」「項目」「供應商」「歸檔」）。

## 6. 整體驗證

- [x] 6.1 整體驗證 Locale activation in clients 與 Complete zh-TW dictionary 的實際效果，並確認英文語系沒有變慢。[after: 3.1, 3.2, 5.5, 7.2, 7.4]
  - `vp run check:changed` 全部通過。
  - 用獨立的 `--home-dir` 啟動 dev server，切到中文（繁體）後截圖：側邊欄、聊天輸入框與工具列、命令面板、右鍵選單、toast、各設定分頁。
  - 用 Replay (dev) provider 的 `showcase` 跑一輪，確認聊天內容與程式碼區塊沒有被翻譯。
  - 比較加入外掛前後 `vp run build`（apps/web）的耗時，增加超過 10% 時記錄並回報。

## 7. 選單項目 label（實測後追加）

實測發現右鍵選單與命令面板的項目是在函式內組出的物件 `{ label: "…" }`，原規則沒有涵蓋。依 design「選單項目的 `label` 屬性在函式內才改寫」補上。

- [x] 7.1 實作 Menu item labels are rewritten（TDD）。[after: 1.5]
  - 函式內物件字面值的 `label` 屬性，值為字串或 template literal 時改寫成 `__t`／`__ts`；模組層物件與其他屬性名稱不改。`collectMessages` 同步涵蓋。
  - 驗證：`transform.test.ts` 的 `describe("Menu item labels are rewritten")` 涵蓋 spec 範例表四列，全部通過；既有案例不退化。
- [x] 7.2 翻譯 7.1 新增的字串並合併進 `zh-TW.json`，遵守第 5 節用語表。[after: 7.1, 5.5]
  - 驗證：`node scripts/i18n-overlay.ts missing --locale zh-TW` 與 `stale` 都輸出零筆。
- [x] 7.3 實作 Runnable item titles are rewritten（TDD），遵循「命令面板只在物件有 `run` 時改寫 `title`」。[after: 7.1]
  - 函式內、帶 `run` 屬性的物件字面值，其 `title`、`description` 為字串或 template literal 時改寫；排除規則同 7.1。
  - 驗證：`transform.test.ts` 的 `describe("Runnable item titles are rewritten")` 涵蓋 spec 範例表四列，全部通過。
- [x] 7.4 翻譯 7.3 新增的字串並合併進 `zh-TW.json`。[after: 7.3, 7.2]
  - 驗證：`node scripts/i18n-overlay.ts missing --locale zh-TW` 與 `stale` 都輸出零筆。

## 8. 收尾審查修正

- [x] 8.1 mobile 的 overlay 改在 app 根部啟用，遵循「語系切換以 key 重新掛載整個介面」的 mobile 段落。[after: 3.2]
  - overlay 語系設定與 keyed Fragment 從設定畫面的 `I18nProvider` 移到 `App.tsx` 根部的獨立元件；`I18nProvider` 的 overlay 改動撤回。
  - 驗證：`apps/mobile` typecheck 只剩既有的 `app.config.ts`、`tracing.test.ts` 兩個錯誤；`expo export` 成功，bundle 中 `setOverlayLocale` 由根部元件呼叫。
- [x] 8.2 `apps/web/src/i18n/runtime.ts` 改成在 `whenLocaleReady` 一行並行載入 overlay 字典，`loadLocale` 還原為上游原樣。[after: 3.1]
  - 驗證：`apps/web` typecheck 通過；dev server 實測 zh-TW 啟動與切換仍正常。
- [x] 8.3 改寫函式修正（TDD）：排除 `Result` 結尾的 callee；字串字面值與 template literal 的 key 保留換行；JSX 文字只去 `[ \t\r\n]`，保留 `&nbsp;`。[after: 7.3]
  - 驗證：`transform.test.ts` 新增案例先 RED 後全綠；煙霧掃描行數不變、重新解析 0 錯誤。
- [x] 8.4 依 8.3 更新字典（含 `Checks` 對應自己、移除不再出現的 key、補上含換行的新 key），`missing` 與 `stale` 歸零。[after: 8.3]
- [x] 8.5 mobile 的 `OverlayLocaleRoot` 在語言偏好讀完前不渲染 children，避免冷啟動整棵重新掛載（複審 important）。[after: 8.1]
  - 驗證：`apps/mobile` typecheck 只剩既有兩個錯誤；`expo export` 成功。

## 9. spectra-verify／spectra-review 修正

- [x] 9.1 JSX 子節點中只含字串字面值的容器（如 `{"\n"}`）在訊息中原樣保留，不被收斂（TDD），依 spec「Mixed text and expressions form one message」。[after: 8.3]
  - 驗證：`transform.test.ts` 新增 spec 範例第四列的案例，先 RED 後綠；煙霧掃描行數不變、重新解析 0 錯誤。
- [x] 9.2 mobile 切換語系時保存導覽狀態並在重建後還原，依 design Risks「mobile 切換語系會重建 `NavigationContainer`」。[after: 8.5]
  - 驗證：`apps/mobile` typecheck 只剩既有兩個錯誤；`expo export` 成功。未在裝置上驗證時於回報中註明。
  - 結果：未在裝置上驗證；導覽還原與 prune 行為依程式碼判讀（`new-task-flow-state.ts` 只刪不在導覽狀態中的流程），typecheck 與 `expo export` 通過。
- [x] 9.3 mobile transformer 在 dev 模式下解析失敗時印一行只含檔名的 warn（比照 web）；web 外掛對測試檔不再做第二次解析。[after: 3.1, 3.2]
  - 驗證：相關檔案 lint／fmt 通過；`expo export` 成功。
- [x] 9.4 依 9.1 更新字典 key，`missing` 與 `stale` 歸零。[after: 9.1]
- [x] 9.5 web 語系啟用時機的測試：`apps/web/src/i18n/runtime.test.ts`（新檔）驗證 `whenLocaleReady()` resolve 前 overlay 仍是英文、resolve 後依 `requestedLocale` 啟用，且被後續語系取代的舊請求不會啟用（spectra-verify W2）。[after: 8.2]
- [x] 9.6 字典載入失敗退回英文的測試：`runtime.test.ts` 新增案例，載入失敗時 resolve 不拋錯、查詢回傳原文，且之後可重試（spectra-verify W3）。[after: 2.1]
- [x] 9.7 把 web 外掛與 mobile transformer 的路徑篩選抽成 `transform.ts` 的純函式並補測試，涵蓋 `?query`、Windows 反斜線、`.test.`、非 `.ts`/`.tsx`、根目錄外（spectra-verify W4）。[after: 9.3]

## 10. 第二輪 spectra-verify／spectra-review 修正

- [x] 10.1 web 字典遲到載入成功時也要重新掛載（TDD），依 spec「Locale activation in clients」與 design「字典載入失敗時一律顯示英文」：`packages/client-runtime/src/i18nOverlay/runtime.ts` 匯出 `hasOverlayDictionary(locale)`；`apps/web/src/i18n/runtime.ts` 的 snapshot 增加 `overlayReady`，`activateLocale` 只有在語系、GT 翻譯與 `overlayReady` 都沒變時才提早 return；`I18nProvider.tsx` 的 Fragment key 改用 `${locale}:${overlayReady}`（spectra-review important；一併處理 spectra-verify W1）。
  - 驗證：`apps/web/src/i18n/runtime.test.ts` 新增「zh-TW 字典第一次載入失敗、重試成功後 snapshot 變更並通知 listener」與「同語系字典仍未就緒時不重複通知」，先 RED 後綠；在 `apps/web` 執行 `vp test run src/i18n/runtime.test.ts` 通過。
- [x] 10.2 被排除的元素（`T`、`code`、`pre`、`kbd`）只略過子節點，自身屬性照常改寫（TDD），依 spec「Exclusions」只排除 content inside（spectra-review nit：`TerminalContextInlineChip.tsx` 的 `<pre aria-label>`）。同時補 `<Code>`、`<Pre>` 不分大小寫的案例（spectra-verify S2），以及範例表 message construction 第四列的值 0 是 `<Text>+</Text>` 元素的斷言（spectra-verify W3）。
  - 驗證：`packages/client-runtime` 執行 `vp test run src/i18nOverlay/transform.test.ts` 通過。
- [x] 10.3 `transformSource` 區分「解析失敗」與「沒有可改寫字串」，web 外掛與 mobile transformer 不再為了印 warn 重新解析（spectra-review nit、spectra-verify S1）。[after: 10.2]
  - 驗證：`transform.test.ts` 新增解析失敗與沒有字串的回傳值案例；`apps/web/vite/i18nOverlay.ts`、`apps/mobile/i18nOverlayTransformer.js` lint／fmt 通過。
- [x] 10.4 測試補強（spectra-review nit、spectra-verify W2）：`runtime.test.ts` 的載入案例改斷言確實被翻譯的 key，`vi.doUnmock` 移到 `finally`；`scripts/i18n-overlay.ts` 匯出 `main`，測試涵蓋未知子指令與缺少 `--locale` 回傳 2；新增 `apps/mobile/src/i18n/overlayNavigationState.test.ts`，涵蓋「語系改變且導覽就緒時保存、取一次就清空」「第一次 render 與語系未變時不保存」「導覽未就緒時不保存」。
  - 驗證：各測試檔以 `vp test run <file>` 通過。
- [x] 10.5 design Risks 記錄兩項取捨（spectra-review nit）：JSX 文字同一行內連續空白會收斂成一個（目前兩個 src 皆 0 處，遇到時改成不改寫）；mobile `OverlayLocaleRoot` 等偏好讀完才掛載 `AppContent`，splash 上限計時隨之延後，切換語言時 splash／用量協調元件會重新掛載。
