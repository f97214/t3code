## Why

上游的多語系（gt-react）目前只翻譯了設定頁的「一般」分頁與設定側邊導覽，其餘畫面都是寫死的英文。選了「中文（繁體）」之後，大部分介面仍然是英文。

估計還沒翻的量是：web 約 2,521 個、mobile 約 694 個不重複的 JSX 文字與屬性字串（以 oxc 解析器掃描 `apps/web/src` 與 `apps/mobile/src` 的非測試 `.tsx` 檔實測），另外還有 497 處 `toastManager.add` 呼叫（以 grep 實測）。如果照上游的方式逐一用 `<T>`／`useGT` 包字串，要改上千個元件檔，這個 fork 之後每次同步上游都會衝突。

## What Changes

- 新增一個編譯期翻譯模組。建置時把介面上的英文字串改寫成查字典的呼叫，元件原始碼完全不改。
  - 改寫範圍包含 JSX 文字、文字夾雜變數的句子、指定的可見屬性（`title`、`placeholder`、`aria-label` 等），以及 toast 與確認對話框呼叫中的標題與說明。
- 新增獨立的 `zh-TW` 翻譯字典，以英文原文當 key，內容用台灣用語。
- web／desktop 由 Vite 外掛套用，mobile 由 Metro transformer 套用，兩邊共用同一個改寫函式與執行期。
- 語言切成 `zh-TW` 時，第一次渲染就是中文；切換語言後整個介面會重新掛載並更新。字典裡沒有的字串一律維持英文。
- 新增字典維護腳本，可以列出原始碼中還沒翻的字串，以及字典裡已經過時的 key。同步上游後用它補翻。
- 翻譯全部現有介面字串，寫進 `zh-TW` 字典。

## Non-Goals (optional)

詳見 design.md 的 Goals / Non-Goals。

## Capabilities

### New Capabilities

- `ui-translation-overlay`: 在建置時把用戶端介面的英文字串改寫成查字典的呼叫，並依目前語系顯示翻譯；查不到時顯示原文。

### Modified Capabilities

（無）

## Impact

- 新增程式碼：packages/client-runtime/src/i18nOverlay/（改寫函式、執行期、zh-TW 字典與測試）、apps/web/vite/i18nOverlay.ts、apps/mobile/i18nOverlayTransformer.js、apps/mobile/src/i18n/OverlayLocaleRoot.tsx、apps/mobile/src/i18n/overlayNavigationState.ts、scripts/i18n-overlay.ts
- 小幅修改的上游檔案：apps/web/vite.config.ts、apps/web/src/i18n/runtime.ts、apps/web/src/i18n/I18nProvider.tsx、apps/mobile/metro.config.js、apps/mobile/src/App.tsx、apps/mobile/src/i18n/I18nProvider.tsx、packages/client-runtime/package.json、knip.jsonc
- 相依套件：不新增。改寫使用 Vite+ 內建的 oxc `parseSync`。
- 效能：建置時每個用戶端原始碼檔多一次解析；執行期每個字串多一次 Map 查詢。英文語系下查詢會直接回傳原文。
- 不影響 server、contracts 與通訊協定，也不會把翻譯後的文字寫進資料。
