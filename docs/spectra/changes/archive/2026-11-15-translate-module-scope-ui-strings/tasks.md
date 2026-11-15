## 1. 執行期（TDD）

- [x] 1.1 實作 Rebinding runtime：`packages/client-runtime/src/i18nOverlay/runtime.ts` 匯出 `__tb(assign)`，註冊後立即執行一次；`setOverlayLocale`、`registerOverlayDictionary` 只在目前生效的字典改變時，依註冊順序重跑全部 `assign`。
  - 先寫失敗的測試，再實作。測試是純函式，沒有檔案系統、網路或時間相依；每個案例開頭以 `setOverlayLocale("en")` 重設狀態。
  - 驗證：`packages/client-runtime/src/i18nOverlay/runtime.test.ts` 新增 `describe("Rebinding runtime")`，涵蓋 spec「when callbacks run」範例表五列與「switching locale rebinds constants」案例；在 `packages/client-runtime` 執行 `vp test run src/i18nOverlay/runtime.test.ts` 通過。
  - 若 knip 把只給改寫後程式使用的 `__tb` 報成未使用的 export，比照 `__t` 既有的處理方式。

## 2. 改寫函式（TDD）

測試共通事項：所有案例都加在 `packages/client-runtime/src/i18nOverlay/transform.test.ts`，輸入輸出都是字串，使用真的 `vite-plus` `parseSync`，沒有檔案系統、網路或時間相依；以 `vp test run src/i18nOverlay/transform.test.ts`（在 `packages/client-runtime` 執行）跑。

- [x] 2.1 實作 Conditional string branches in display positions，遵循「三元與邏輯運算式只在既有顯示位置改寫字串分支」：在既有規則改寫字串的每個位置，遞迴改寫條件運算式的兩個分支與 `&&`／`||`／`??` 的右側；條件與左側運算元不動；JSX 子節點運算式也算顯示位置，夾在句子中時仍是佔位值。
  - 先寫失敗的測試，再實作。`collectMessages` 要回傳同樣的 key。
  - 驗證：新增 `describe("Conditional string branches in display positions")`，涵蓋 spec「branch rewrites」範例表八列與「conditions are left alone」案例，並確認既有 `describe` 全部仍通過、改寫後行數不變。
- [x] 2.2 實作 Module-scope file list 的比對與 Module-scope display properties become getters，並調整 Menu item labels are rewritten 與 Runnable item titles are rewritten 的模組層例外，遵循「模組層字串改成讀取時才查字典，且只套用在已審核的檔案」：`transformSource`／`collectMessages` 接受 `{ moduleScopeFiles }`，只對命中清單的檔案把模組層物件的指定顯示屬性改寫成 `get <name>() { return __t(…); }`。[after: 2.1]
  - 同時更新這兩條需求的既有測試：模組層案例改成「未列入清單的檔案」，並各加一列「列入清單時改成 getter」。
  - 驗證：新增 `describe("Module-scope file list")` 涵蓋「path matching」範例表五列與「unlisted file keeps module-scope strings in English」；新增 `describe("Module-scope display properties become getters")` 涵蓋「getter rewrites in a listed file」範例表七列與「line count is preserved」；另以 `new Function` 執行一個改寫後的小模組片段（以假的 `__t` 注入），確認換語系後同一物件的 `title` 讀到新值。
- [x] 2.3 實作 Module-scope string constants are rebound on locale change：清單內檔案的模組層單一宣告子 `const`（含 `export const`）改寫成 `let X; __tb(() => { X = …; });`，同一行完成，不增減行數。[after: 2.2]
  - 驗證：新增 `describe("Module-scope string constants are rebound on locale change")`，涵蓋「composer placeholder constant」案例與「constant rewrites in a listed file」範例表六列。

## 3. 清單與維護指令

- [x] 3.1 依「已審核檔案清單放在 fork 自有的 JSON，由呼叫端傳入改寫函式」接上清單：新增 `packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json`（先放空的 `include` 與 `exclude`）；`apps/web/vite/i18nOverlay.ts` 與 `apps/mobile/i18nOverlayTransformer.js` 讀取 `include` 傳給 `transformSource`，讀不到或格式錯誤時視為空清單並在 dev 模式印一行只含清單檔路徑的 warn；mobile 的 `getCacheKey` 納入清單檔內容。[after: 2.3]
  - 這個任務只有接線，邏輯由 2.x 的測試涵蓋，不新增自動化測試。
  - 驗證：在 `include` 暫時放入 `apps/web/src/composerPlaceholder.ts`，以 `vp run build`（在 `apps/web`）建置後，產出的 bundle 含 `__tb(`；在 `apps/mobile` 執行 `vp exec expo export --platform android --output-dir <scratchpad>`，bundle 也含 `__tb(`，且 import 端是透過 `exports` 讀取該常數。確認後把暫放的路徑移除（正式內容在 4.1 決定）。
- [x] 3.2 實作 Module-scope candidate report，遵循「新增 `module-candidates` 子指令找出待審核的檔案」：`scripts/i18n-overlay.ts` 新增 `module-candidates`，輸出 `{ unlisted: [{ file, count, samples }], missingListed: [...] }`；`missing`、`stale` 對 `include` 內的檔案套用模組層規則。[after: 3.1]
  - 先寫失敗的測試，再實作。測試沿用該檔既有作法，在暫存目錄建立範例 repo（檔案系統只碰暫存目錄，不碰真的字典與清單）。
  - 驗證：`scripts/i18n-overlay.test.ts` 新增「module-candidates lists unlisted files with module-scope strings」「module-candidates lists listed paths that no longer exist」「missing includes module-scope keys from listed files」三個案例，以 `vp test run scripts/i18n-overlay.test.ts` 通過；USAGE 說明加入新子指令。

## 4. 審核與翻譯

審核的判準：會被複製進設定、送給 agent、存檔、序列化、被字串比對，或模組層屬性會被賦值的檔案放進 `exclude` 並寫明原因；其餘放進 `include`。清單內被程式比對的字串，在字典中讓它對應到自己（沿用前一個 change 的清單，例如 `Browser`）。

- [x] 4.1 審核 `module-candidates` 列出的 web 檔案（`apps/web/src`），依上面的判準填入 `moduleScopeFiles.json`。[after: 3.2]
  - 至少確認：`apps/web/src/components/settings/customModelEditor.logic.ts`（預設 label 會存進設定）與 `apps/web/src/proposedPlan.ts`（送給 agent 的提示）在 `exclude`；`apps/web/src/components/settings/settingsSearch.ts`、`apps/web/src/composerPlaceholder.ts`、`apps/web/src/components/chat/ComposerPendingApprovalActions.tsx` 在 `include`。
  - 確認 `searchSettings` 的 `translate(item.title)` 對中文標題原樣回傳（gt-react `m()` 的行為），結果寫進 PR 說明。
  - 驗證：`node scripts/i18n-overlay.ts module-candidates` 的 `unlisted` 中沒有 `apps/web/src` 開頭的檔案，`missingListed` 是空陣列。
  - 結果：清單 include 111、exclude 226（每筆附原因）；`module-candidates` 兩欄皆空。`translate(item.title)` 對中文標題原樣回傳：gt-i18n 的 `interpolateMessage` 在找不到譯文時回傳 source。被比對的字串（例如 `T3 Code`、`off`、`all`、`git:branch-range`）與 `Fast`（`ComposerModelEffort.tsx:544` 比對三元分支的值）在字典中對應到自己。
- [x] 4.2 審核 `module-candidates` 列出的 mobile 檔案（`apps/mobile/src`），依同樣判準填入 `moduleScopeFiles.json`。[after: 4.1]
  - 至少確認：`apps/mobile/src/features/diagnostics/crash-log-model.ts`（解析 crash log）在 `exclude`。
  - 驗證：`node scripts/i18n-overlay.ts module-candidates` 輸出的 `unlisted` 與 `missingListed` 都是空陣列。
- [x] 4.3 翻譯 web 設定頁相關的新字串，寫進 `packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json`，沿用前一個 change 的用語表；複數字尾等片段讓它對應到自己。[after: 4.2]
  - 驗證：`node scripts/i18n-overlay.ts missing --locale zh-TW --under apps/web/src/components/settings` 輸出零筆。
- [x] 4.4 翻譯 web 其餘的新字串。[after: 4.3]
  - 驗證：`node scripts/i18n-overlay.ts missing --locale zh-TW --under apps/web/src` 輸出零筆。
- [x] 4.5 翻譯 mobile 的新字串，完成後由一人統一檢查全部新增翻譯的用語。[after: 4.4]
  - 驗證：`node scripts/i18n-overlay.ts missing --locale zh-TW` 輸出零筆；`node scripts/i18n-overlay.ts stale --locale zh-TW` 沒有本 change 造成的新過時 key。

## 5. 驗收

- [x] 5.1 整體驗證：`vp run check:changed` 全部通過；用獨立的 `--home-dir` 啟動 `vp run dev`，在內建瀏覽器以 zh-TW 截圖外觀、對話、語音、瀏覽器、版本控制各分頁的列標題、聊天輸入框的預設提示、預設批准按鈕與一個含三元運算式的按鈕；切回 English 再截一次確認還原。[after: 4.5]
  - 資料不被翻譯：以程式碼確認，不在 UI 實際存檔：`customModelEditor.logic.ts` 列在 `moduleScopeFiles.json` 的 `exclude`、不在 `include`，新規則下沒有任何改寫，因此存進設定的 label 仍是英文。
  - 效能：比較加入本 change 前後在 `apps/web` 執行 `vp run build` 的耗時，增加超過 10% 時在 PR 說明記錄並檢討。
  - mobile：有裝置或模擬器時，以 `vp run mobile:install` 安裝後截圖設定頁與聊天輸入框；沒有就在回報中標示「未在裝置上驗證」。
  - 結果：`check:changed` 8 項全過。zh-TW 下外觀、聊天、語音、瀏覽器、原始碼控制分頁的列標題、輸入框預設提示（「問任何問題。@ 檔案、$ 技能、/ 指令」）、批准按鈕（拒絕／核准）、runtime 模式（受監督）都是中文；切回 English 後不重新載入即還原（getter 與 `__tb` 生效）。資料：`customModelEditor.logic.ts` 在新規則下沒有任何改寫，以程式碼確認；未在 UI 實際存檔。效能：2,480 個檔案的轉換耗時中位數 1,692 ms → 1,694 ms，build 增加遠低於 10%。mobile：3.1 的 `expo export` bundle 確認 live binding；未在裝置上驗證。
