## Why

`add-zh-tw-i18n-overlay` 上線後，切到「中文（繁體）」仍有大量英文，集中在兩種寫法：模組層常數（import 時就求值，當時語系還是英文）與三元／邏輯運算式的字串分支（改寫規則只認字面字串）。設定頁最明顯：各分頁的列標題來自 `apps/web/src/components/settings/settingsSearch.ts` 的模組層陣列，150 個標題中有 97 個字典裡已有翻譯，畫面上仍是英文。

以 oxc 解析 `apps/web/src` 與 `apps/mobile/src` 非測試檔實測：

- 模組層物件的顯示屬性（`label`、`title`、`description` 等）有 707 處、606 個不重複字串，分布在 87 個檔案，其中 214 個字典裡已有翻譯。
- 模組層字串常數（例如 `DEFAULT_COMPOSER_PLACEHOLDER`，聊天輸入框的預設提示）有 35 個，部分是送給 agent 或用來解析 log 的字串，不能翻。
- 既有規則已認定為顯示位置的地方（JSX 子節點、可見屬性、toast／對話框參數、選單 `label`），其中三元／邏輯運算式的字串分支有 2,264 處、1,674 個不重複字串，分布在 404 個檔案，其中 284 個字典裡已有翻譯。

## What Changes

- 三元與邏輯運算式：在既有規則已改寫的每個顯示位置，若值是 `cond ? "A" : "B"`、`a && "A"`、`a ?? "A"` 這類運算式，就改寫其中的字串分支。條件本身與左側運算元不動。
- 模組層物件屬性：在「已審核檔案清單」內的檔案，模組層物件字面值的顯示屬性改寫成 getter（`get title() { return __t("…") }`），每次讀取時才依目前語系查字典。
- 模組層字串常數：在同一份清單內的檔案，模組層 `const X = "…"` 改成會在語系切換時重新指派的綁定，讓 import 它的檔案讀到目前語系的字串。
- 新增已審核檔案清單 `packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json`。清單外的檔案維持現狀（英文），避免把中文寫進資料或破壞字串比對。
- 字典維護指令新增 `module-candidates` 子指令：列出有模組層候選字串、但不在清單內的檔案，以及清單中已不存在的檔案。同步上游後用它決定要不要審核新檔案。
- 補齊上述新增字串的 zh-TW 翻譯，`missing` 報告維持零筆。

## Non-Goals (optional)

詳見 design.md 的 Goals / Non-Goals。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `ui-translation-overlay`: 由 `add-zh-tw-i18n-overlay` 建立。新增三元運算式分支、模組層物件屬性與模組層字串常數的改寫規則，以及模組層候選檔案報告；「選單 label」與「可執行項目 title」兩條需求原本排除所有模組層物件，改為只排除不在已審核清單內的檔案。

## Impact

- 修改 fork 自有檔案：packages/client-runtime/src/i18nOverlay/transform.ts、packages/client-runtime/src/i18nOverlay/runtime.ts（與兩者的測試）、packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json、scripts/i18n-overlay.ts、apps/web/vite/i18nOverlay.ts、apps/mobile/i18nOverlayTransformer.js
- 新增 fork 自有檔案：packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json
- 上游檔案：不修改任何元件或上游接線檔案。
- 相依套件：不新增。
- 效能：建置時不多解析；執行期每次讀取 getter 多一次 Map 查詢，語系切換時多跑一次重新指派。英文語系下查詢直接回傳原文。
- 不影響 server、contracts 與通訊協定。
- 封存順序：本 change 修改的 `ui-translation-overlay` spec 由 `add-zh-tw-i18n-overlay` 建立，必須在該 change 封存之後才能封存本 change。
