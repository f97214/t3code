## Context

- 上游已經用 gt-react 做多語系：`apps/web/gt.config.json`、`apps/mobile/gt.config.json` 定義語系，翻譯檔以內容 hash 當 key。目前用到 gt-react 的元件，web 只有設定頁的 `SettingsPanels.tsx`、`SettingsSidebarNav.tsx`、`SettingsBreadcrumb.tsx`、`settingsSearch.ts`，mobile 只有 `SettingsRouteScreen.tsx`、`SettingsLanguageRouteScreen.tsx`（以 grep 實測）。
- 前一個 commit 已經加入 `zh-TW` 語系、「中文（繁體）」選項，以及繁體系統語系的對應（`packages/client-runtime/src/locales.ts` 的 `resolveLocale`）。
- web 啟動流程：`apps/web/src/main.tsx` 會先等 `whenLocaleReady()` 載入語系，才呼叫 `createRoot().render()`。語系狀態由 `apps/web/src/i18n/runtime.ts` 管理（`loadLocale`、`activateLocale`），`I18nProvider` 透過 `useSyncExternalStore` 讀取。
- web 的 Vite 外掛設定是 `react({ compiler: true })`，React Compiler 會快取 JSX。
- mobile 用 Metro 加 `babel-preset-expo`。Expo 預設的 babel transformer 路徑可以從 `getDefaultConfig()` 回傳值的 `transformer.babelTransformerPath` 取得（已實測）。
- 解析器：`vite-plus` 匯出 oxc 的 `parseSync`，可以解析 TSX 並提供字元位置。`apps/web`、`apps/mobile`、`packages/client-runtime` 都能 import 它，mobile 的 Node 24 也能同步 `require("vite-plus")`（已實測）。
- 字串量：web 2,521、mobile 694 個不重複字串（oxc 實測，只算 JSX 文字與允許清單內的屬性）；另有 497 處 `toastManager.add`、18 處 `confirmDialog`、9 處 `addToast`（grep 實測）。
- 限制：這是個人 fork，要能經常同步上游，所以上游檔案的修改要盡量少。

## Goals / Non-Goals

**Goals:**

- 切到「中文（繁體）」時，web、desktop、mobile 的介面字串都顯示台灣用語，元件原始碼不改。
- 上游檔案只動幾行接線程式；翻譯邏輯與字典都放在新檔。
- 同步上游後，用一個指令就能找出新增、還沒翻的字串。
- 英文語系的行為與效能和目前一致。

**Non-Goals:**

- 不翻 Electron 主程序的原生選單、系統通知文字，也不翻 server 回傳的錯誤訊息與 provider 的輸出內容。
- 不翻模組載入時就求值的常數（例如模組層級陣列裡的 `label`）。
- 不改寫、也不取代上游的 gt-react 機制。已經用 `<T>`、`useGT`、`msg` 翻的字串維持原狀。
- 不處理 `zh-TW` 以外語系的 overlay 字典。機制支援其他語系，但這次不提供字典。
- 不把變更提交回上游。

## Decisions

### 編譯期改寫，不逐檔包 `<T>`，也不在執行期替換 DOM

在建置階段把字串改寫成查字典的呼叫。

- 逐檔包 `<T>`：要改上千個元件檔，每次同步上游都會衝突。
- 執行期用 MutationObserver 替換 DOM 文字：mobile（React Native）沒有 DOM；每次 DOM 變動都要掃描，有效能成本；還可能誤翻聊天內容與程式碼。

編譯期改寫只看原始碼裡的字面字串，聊天內容等執行期資料不會被碰到。

### 字典以英文原文當 key，不用 hash

翻譯的人直接看得懂 key；上游改了原文時，`missing` 會列出新句子、`stale` 會列出舊 key，可以自然地汰換。代價是同一句英文在不同情境只能有一種翻譯，這對介面字串可以接受。

### 用 Vite+ 內建的 oxc parseSync 與字串拼接，不新增相依

改寫函式不直接 import 解析器，而是由呼叫端傳入 `parseSync`：web 外掛、mobile transformer、測試與維護腳本都從 `vite-plus` 取得。這樣 `packages/client-runtime` 裡的瀏覽器端程式不會引入 Node 相依，也不用改 lockfile。

改寫時只替換字元範圍，不加換行，所以行號不變。不另外產生 source map；欄位位置可能小幅偏移，這點可以接受。

### 翻譯模組放在 `packages/client-runtime` 的子路徑

web 與 mobile 已經依賴 `@t3tools/client-runtime`，新增 `./i18n-overlay`（執行期，web 以 lazy import 載入字典）、`./i18n-overlay/transform`（改寫函式）與 `./i18n-overlay/dictionaries/zh-TW.json`（mobile 靜態匯入字典）三個 export 即可。不新增 workspace 套件，所以不必改 lockfile。

### 三種執行期查詢與帶 key 的 Fragment 佔位值

`client-runtime` 沒有依賴 React，所以執行期不直接建立 React 元素：

- `__t(key)`：查純字串。
- `__ts(key, values)`：字串內插，給屬性與 toast 參數用，回傳字串。
- `__tx(key, values)`：JSX 夾雜內容用，回傳由字串與值組成的陣列。

為了避免 React 對陣列子元素發出缺少 key 的警告，改寫函式會把每個 JSX 佔位值包成 `<__I18nFragment key="i18n-N">…</__I18nFragment>`，並在檔案開頭注入 `import { Fragment as __I18nFragment } from "react"`。

### 語系切換以 key 重新掛載整個介面

React Compiler 會把不依賴 props 或 state 的 JSX 快取起來，`__t()` 的結果也在其中，所以只改語系不會更新畫面。在 `I18nProvider` 的 children 外包一層以語系為 key 的 Fragment，切換時整棵重新掛載，所有字串都會用新語系重算。

web 啟動時第一次渲染之前，語系就已經決定好，所以不會在啟動時重新掛載。存放在 React 外的狀態（store、WebSocket 連線、URL）不受影響。

mobile 的 `I18nProvider` 只包在設定畫面裡（上游的 gt-react 只翻設定頁），不能用來啟用 overlay。overlay 的語系設定與 keyed Fragment 放在 `App.tsx` 根部的獨立元件，讓全部畫面都跟著語系重新掛載。語言偏好是從本機資料庫非同步讀取的，讀完之前這個元件不渲染畫面（splash 本來就會等偏好讀完才收起），否則非英文使用者每次冷啟動都會先以英文掛載、再整棵重新掛載一次。

### toast 與確認對話框參數採白名單

只改寫以下呼叫中的顯示文字，這些都是呼叫當下才求值、只用來顯示的文字：

- web：`toastManager.add` 物件參數的 `title`、`description`；`requestConfirmDialog` 的第一個參數（訊息字串）。
- mobile：`Dialog.confirm`、`Dialog.prompt` 物件參數的 `title`、`message`、`confirmText`、`cancelText`；`Dialog.alert` 的前兩個參數。

（原本列的 `addToast`、`confirmDialog` 在原始碼中沒有呼叫，實作時依實測改成上列 API。）其他物件即使有 `title` 欄位也不改，例如 `createThread({ title })` 會寫進資料，翻了會把中文存進資料庫。

### 選單項目的 `label` 屬性在函式內才改寫

右鍵選單與命令面板的項目是在函式內組出的物件陣列（例如 `{ id: "pin", label: "Pin thread" }`），不是 JSX 文字。實測時發現原規則漏掉它們，因此新增一條規則：函式內物件字面值的 `label` 屬性，若值是字串或 template literal 就改寫。

- 只看 `label`，不看 `title` 等其他屬性。`title` 常是會寫進資料的欄位，例如 `createThread({ title })`。
- 模組層的物件不改。它們在 import 時就求值，當時語系還是英文，改了也不會生效，與「不翻模組載入時就求值的常數」的非目標一致。
- 傳給 callee 名稱以 `Command`、`Query`、`Action`、`Result` 結尾的呼叫（`useAtomCommand`、`useOrchestrationCommand`、`useAction`、`reportAtomCommandResult`…）的物件不改：那裡的 `label` 是指令的內部識別名稱，用在 log 與 `Atom.withLabel`，不是介面文字。
- 必須在字典中對應到自己的 key（翻譯會破壞行為或寫進資料）：
  - 被程式比對：`Commit`、`Push`（`GitActionsControl.tsx`）、`Browser`（`RightPanelTabs.tsx`）、`Styles`（mobile `ComposerContextSheet.tsx`）、`Checks`（`PullRequestSummaryTab.tsx` 以 `[aria-label="Checks"]` 選取）。
  - 會送到 server 或存進設定：`T3 Code Desktop`、`T3 Code Web`（`connection/clientMetadata.ts`）、`EAS Simulator`、`Simlock`（裝置主機設定的預設名稱）。
  - 品牌片段：`Code`（「T3 Code」被拆成兩個文字節點）。
- 風險：被翻譯的字串可能被程式拿來比對（`label === "…"`、`[aria-label="…"]` 選取器），或寫進資料。處理方式是讓那些 key 在字典中對應到自己（清單見上），代價是它們在別處也顯示英文。同步上游後若出現新的同類用法，照同樣方式處理。

### 命令面板只在物件有 `run` 時改寫 `title`

命令面板的動作項目是 `{ title, description, searchTerms, run }`。`title` 一般不改（會寫進資料），但帶 `run` 函式的物件是「可執行的介面項目」，它的 `title`／`description` 只拿來顯示與搜尋。搜尋同時比對 `title` 與 `searchTerms`，翻譯後英文關鍵字仍由 `searchTerms` 命中；沒有 `searchTerms` 的項目在中文語系下只能用中文搜尋，這點接受。

### mobile 以包裝 Metro transformer 的方式套用

`apps/mobile/metro.config.js` 先取得 Expo 預設的 `babelTransformerPath`，用環境變數 `T3CODE_I18N_OVERLAY_UPSTREAM_TRANSFORMER` 傳給 worker，再把 `babelTransformerPath` 指到新檔 `apps/mobile/i18nOverlayTransformer.js`。這個新檔對 `src/` 下的檔案先跑 `transformSource`，再把結果交給原本的 transformer。

不另外寫一份 Babel plugin，web 與 mobile 就能共用同一份改寫規則。

### 刻意保留英文的字串在字典裡對應到自己

品牌名、provider 名稱、指令名稱在字典中寫成 `"Codex": "Codex"`。這樣 `missing` 報告可以歸零，往後只要報告不為空，就代表有新字串要處理，不必另外維護一份忽略清單。

## Implementation Contract

**使用者看到的行為**

- 語言設成「中文（繁體）」時，側邊欄、聊天輸入框與工具列、命令面板、右鍵選單、對話框、toast、各個設定分頁都顯示台灣用語。
- 聊天訊息、程式碼區塊、檔名、使用者輸入的內容維持原樣。
- 字典裡查不到的字串顯示英文。
- 切換語言後介面會立即全部更新；切回 English 時完全還原。

**介面**

- `packages/client-runtime` 匯出 `./i18n-overlay/transform`：
  - `transformSource(code: string, filename: string, parseSync: ParseSync): { code: string } | { parseFailed: true } | null`：`{ code }` 表示有改寫；`{ parseFailed: true }` 表示解析失敗；`null` 表示不處理（測試檔、`node_modules`，或沒有可改寫的字串）。
  - `collectMessages(code: string, filename: string, parseSync: ParseSync): Array<{ key: string; line: number }>`
  - 兩者採用同一套規則，規則見 `specs/ui-translation-overlay/spec.md` 的各項 Requirement。
- `packages/client-runtime` 匯出 `./i18n-overlay`：
  - 查詢函式 `__t(key)`、`__ts(key, values)`、`__tx(key, values)`。
  - 設定函式 `setOverlayLocale(locale)`、`registerOverlayDictionary(locale, dictionary)`。
  - 字典載入函式 `loadOverlayDictionary(locale): Promise<void>`，用 lazy import 載入 `dictionaries/<locale>.json`；沒有該語系的字典時直接 resolve。
- 字典格式：扁平 JSON 物件 `{ [英文 key]: 翻譯 }`，佔位寫成 `{0}`、`{1}`。
  - JSX 文字的 key 依 JSX 規則收斂空白並去頭尾，只去一般空白與換行，不去 `&nbsp;`（U+00A0）。
  - 屬性、呼叫參數與物件屬性的字串字面值與 template literal，key 原樣保留，包含換行，因為那些換行會被顯示出來。
- 改寫後的呼叫形式（給 code review 參考）：
  - 純 JSX 文字：`{__t("…")}`
  - JSX 夾雜內容：`{__tx("… {0} …", [<__I18nFragment key="i18n-0">{expr}</__I18nFragment>])}`
  - 屬性與 toast 參數：`__ts("… {0} …", [expr])`
- 字典維護指令：`node scripts/i18n-overlay.ts missing --locale zh-TW` 與 `node scripts/i18n-overlay.ts stale --locale zh-TW`，輸出 JSON 到 stdout，成功時 exit 0、參數錯誤時 exit 2，不寫檔。

**失敗模式**

- 某個檔案解析失敗時，`transformSource` 回傳 `{ parseFailed: true }`，該檔沿用原始碼、不翻譯，不中斷建置；`collectMessages` 對解析失敗的檔案回傳空陣列。web 外掛與 mobile transformer 只在 dev 模式遇到 `parseFailed` 時印一行 warn，內容只含檔名。
- 字典載入失敗時，該語系的 overlay 一律顯示英文，與 gt-react 載入失敗時的行為一致。

**驗收方式**

- `packages/client-runtime/src/i18nOverlay/transform.test.ts`：spec 的每一個 Example 表格都要有對應的測試案例。
- `packages/client-runtime/src/i18nOverlay/runtime.test.ts`：查詢、找不到時回退原文、佔位替換。
- `vp run check:changed` 全部通過。
- `node scripts/i18n-overlay.ts missing --locale zh-TW` 輸出零筆。
- 用獨立的 `--home-dir` 啟動 dev server，在 web 上切換語系並截圖：主要畫面是中文、Replay 跑出的對話內容沒有被翻譯、切回 English 後能還原。
- mobile 至少要能成功產出 Metro bundle；有辦法用裝置或模擬器時要截圖。無法在裝置上驗證時，要明確標示為未驗證。

**範圍**

- 範圍內：上面列出的改寫規則、web／desktop／mobile 的接線、字典維護指令、完整的 zh-TW 字典。
- 範圍外：Goals / Non-Goals 列出的項目，以及修改任何元件原始碼。

## Risks / Trade-offs

- [上游改了 `vite.config.ts`、`runtime.ts`、`I18nProvider.tsx`、`metro.config.js` 的鄰近程式碼，同步時衝突] → 接線程式各自只有一到三行，而且集中在固定位置，衝突時容易手動重套。
- [JSX 文字其實不是介面字串，例如範例程式碼或 SVG 內的文字] → `code`、`pre`、`kbd` 已排除；字典查不到的 key 會顯示英文，誤抓的字串只要不放進字典就不受影響（可以在字典中讓它對應到自己）。
- [同一句英文在不同情境需要不同翻譯] → 以英文原文當 key 時無法區分情境；遇到時以最常見的情境為準，並記在字典維護說明中。目前沒有實測案例。
- [重新掛載會丟失畫面上的暫時狀態，例如尚未送出的表單] → 只在使用者主動切換語言時發生，屬於低頻操作。
- [多一次解析會讓建置變慢] → oxc 解析很快，而且只處理 `src/` 下的 `.ts`、`.tsx`。實測：Rolldown 的耗時報告中，外掛 transform 三次 build 分別是 2.3、6.3、8.8 秒，約佔外掛回呼時間的 6–7%；以最安靜的一次（整體 40.9 秒）估算約 5–6%，未超過 10%。量測時同機有其他檢查在跑，數字含雜訊。
- [以 key 重新掛載可能讓依賴 mount 的副作用（例如連線訂閱）重跑] → web 已以 dev server 實測切換語系後，連線狀態與執行緒列表正常。
- [desktop 內建瀏覽器在切換語系時重新載入] → web 的 keyed Fragment 也包住 `ElectronBrowserHost`，依其註解，webview 重建時 guest 會被銷毀，所以分頁很可能重新載入。只在使用者主動切換語言時發生；未在 desktop 實測。
- [mobile 切換語系會重建 `NavigationContainer`] → 重掛前保存導覽狀態，重建時以 `initialState` 還原，避免被丟回首頁與新工作流程被清除（任務 9.2）。
- [mobile 冷啟動要等語言偏好讀完才掛載畫面] → splash 本來就等同一個條件才收起，所以畫面上看不出差異；但首頁開始渲染的時間點會延後到偏好讀完之後（本機資料庫讀取），英文使用者也一樣。未在裝置上量測。
- [mobile 在 render 中設定全域 overlay 語系] → 若 React 放棄一次 render，全域語系可能已是新值、畫面仍是舊語系，造成少數字串中英混雜。機率低；mobile 實機驗證時加測快速來回切換語系。
- [翻譯量大，用語可能不一致] → 先定下用語表；分批翻完後由一人統一檢查，並以 `missing` 報告歸零作為完成條件。
- [JSX 文字在同一行內的連續空白或 tab 會被收斂成一個空格] → `transform.ts` 的 `collapseJsxWhitespace` 會做這個收斂，而 JSX（Babel）只修剪行首行尾、同一行內的多個空白會保留。因此 `<Text>a   b</Text>` 或套用 `whitespace-pre*` 的元素，改寫後英文也只剩一個空格。目前 `apps/web/src` 與 `apps/mobile/src` 共 0 處，先接受；日後出現時，讓這種文字不改寫。
- [mobile 的 `OverlayLocaleRoot` 會等語言偏好讀完才掛載 `AppContent`] → `SplashScreenCoordinator` 的 1.5 秒上限（`SPLASH_WAIT_MS`）因此從偏好讀完起算，而不是從 app 啟動起算；偏好讀得慢時，splash 最長停留「偏好讀取時間 + 1.5 秒」。切換語言時，`SplashScreenCoordinator` 與 `SubscriptionUsageCoordinator` 也會隨 remount 重新執行 effect。未在裝置上量測，先接受並記錄；若實測有感，把 `OverlayLocaleRoot` 移到只包住 Navigation 的那一層。
- [web 啟動時 GT 翻譯與 overlay 字典都載入失敗，之後重試時 overlay 字典先載好、GT 仍在等網路] → overlay 字典註冊後立即生效（`packages/client-runtime/src/i18nOverlay/runtime.ts` 的 `registerOverlayDictionary`），但重新掛載要等兩者都完成（`apps/web/src/i18n/runtime.ts` 的 `whenLocaleReady`）。這段期間因其他原因重新 render 的元件會先變中文，其餘仍是英文，兩者都完成後重新掛載自行修正；只有 overlay 失敗時不會發生。未實際重現，先接受；若要消除，改成字典註冊後不自動生效、只由語系啟用流程切換。
